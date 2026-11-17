#!/usr/bin/env python3
"""
KTX 잔여석 감시 배치
- 지정한 열차의 일반실이 '예약 가능'으로 바뀌면, 다시 '매진'으로 바뀌면 카카오톡 '나에게 보내기'로 알린다
- 자리를 찾아도 끝나지 않고 멈출 때까지 감시한다 (열차 출발 시각이 지나면 스스로 끝난다)
- 상태는 에이전트 모니터(픽셀 오피스)로도 보낸다: 예약 가능 = COMPLETE(대시보드 알림·웹 푸시), 그 밖 = WORKING

실행은 sh 로 한다 (pm2 ecosystem 에 넣지 않는다):
  bash scripts/ktx-watch.sh start | stop | status | log | once | test-notify

조건 우선순위: CLI 옵션 > jobs/.env (KTX_*) > 기본값(아래 DEFAULTS)

조회는 코레일 모바일 앱이 쓰는 비공식 엔드포인트(공식 공개 API 없음)를 그대로 부른다.
요청 파라미터·응답 필드는 korail2(https://github.com/carpedm20/korail2, BSD) 의 search_train 을 참고했다.
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests

from kakao_notify import send_to_me
from monitor_client import post_status

KST = timezone(timedelta(hours=9))
SCHEDULE_URL = "https://smart.letskorail.com:443/classes/com.korail.mobile.seatMovie.ScheduleView"
UA = "Dalvik/2.1.0 (Linux; U; Android 5.1.1; Nexus 4 Build/LMY48T)"
TRAIN_GROUP_KTX = "00"  # KTX · KTX-산천
SEAT_AVAILABLE = "11"  # h_gen_rsv_cd / h_spe_rsv_cd 가 이 값이면 예약 가능

AVAILABLE = "AVAILABLE"
SOLD_OUT = "SOLD_OUT"
UNKNOWN = "UNKNOWN"

ERROR_ALERT_AFTER = 10  # 연속 조회 실패가 이만큼 쌓이면 에이전트 ERROR 1회
MIN_INTERVAL = 30
WEEKDAYS = "월화수목금토일"

DEFAULTS = {
    "dep": "나주",
    "arr": "용산",
    "date": "20261127",
    "time": "172000",  # 조회 기준 시각(이 시각 이후 열차가 나온다). 466 은 17:24 출발
    "train_no": "466",
    "adults": 1,
    "interval": 60,
}

LOG_FILE = Path(__file__).with_name("watch_ktx.log")


@dataclass
class Config:
    dep: str
    arr: str
    date: str  # yyyyMMdd
    time: str  # HHmmss
    train_no: str
    adults: int
    interval: int

    @property
    def agent_id(self) -> str:
        return "KtxWatcherAgent"

    @property
    def agent_name(self) -> str:
        return f"KTX {self.train_no} 감시"

    @property
    def state_file(self) -> Path:
        return Path(__file__).with_name(f"watch_ktx_state_{self.date}_{self.train_no}.json")


def now_kst() -> datetime:
    return datetime.now(KST)


def log(msg: str) -> None:
    line = f"[{now_kst().strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    try:
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def resolve_config(args: argparse.Namespace) -> Config:
    def pick(name: str, env: str) -> str:
        v = getattr(args, name, None)
        if v not in (None, ""):
            return str(v).strip()
        v = os.environ.get(env, "").strip()
        return v or str(DEFAULTS[name])

    cfg = Config(
        dep=pick("dep", "KTX_DEP"),
        arr=pick("arr", "KTX_ARR"),
        date=pick("date", "KTX_DATE").replace("-", ""),
        time=pick("time", "KTX_TIME").replace(":", "").ljust(6, "0"),
        train_no=pick("train_no", "KTX_TRAIN_NO"),
        adults=int(pick("adults", "KTX_ADULTS")),
        interval=max(MIN_INTERVAL, int(pick("interval", "KTX_INTERVAL"))),
    )
    datetime.strptime(cfg.date + cfg.time, "%Y%m%d%H%M%S")  # 형식 오류면 여기서 멈춘다
    return cfg


def fetch_schedule(cfg: Config) -> dict[str, Any]:
    params = {
        "Device": "AD",
        "Version": "190617001",
        "radJobId": "1",
        "selGoTrain": TRAIN_GROUP_KTX,
        "txtTrnGpCd": TRAIN_GROUP_KTX,
        "txtCardPsgCnt": "0",
        "txtGdNo": "",
        "txtGoAbrdDt": cfg.date,
        "txtGoHour": cfg.time,
        "txtGoStart": cfg.dep,
        "txtGoEnd": cfg.arr,
        "txtJobDv": "",
        "txtMenuId": "11",
        "txtPsgFlg_1": cfg.adults,  # 어른
        "txtPsgFlg_2": 0,  # 어린이
        "txtPsgFlg_8": 0,  # 유아
        "txtPsgFlg_3": 0,  # 경로
        "txtPsgFlg_4": 0,
        "txtPsgFlg_5": 0,
        "txtSeatAttCd_2": "000",
        "txtSeatAttCd_3": "000",
        "txtSeatAttCd_4": "015",
    }
    res = requests.get(SCHEDULE_URL, params=params, headers={"User-Agent": UA}, timeout=15)
    if res.status_code != 200:
        return {"strResult": "FAIL", "h_msg_cd": f"HTTP{res.status_code}", "h_msg_txt": res.text[:120]}
    try:
        return res.json()
    except ValueError:
        return {"strResult": "FAIL", "h_msg_cd": "NOT_JSON", "h_msg_txt": res.text[:120]}


def _same_train_no(a: str, b: str) -> bool:
    return (a or "").strip().lstrip("0") == (b or "").strip().lstrip("0")


def judge(payload: dict[str, Any], train_no: str) -> dict[str, Any]:
    """응답에서 열차를 찾아 일반실 상태를 판정한다. state: AVAILABLE / SOLD_OUT / UNKNOWN"""
    if not isinstance(payload, dict):
        return {"state": UNKNOWN, "summary": "응답 형식 오류"}
    if payload.get("strResult") == "FAIL" or "trn_infos" not in payload:
        code = payload.get("h_msg_cd") or "-"
        text = str(payload.get("h_msg_txt") or "").strip()
        return {"state": UNKNOWN, "summary": f"조회 실패({code}) {text}".strip()}

    infos = ((payload.get("trn_infos") or {}).get("trn_info")) or []
    if isinstance(infos, dict):
        infos = [infos]
    for info in infos:
        if not _same_train_no(str(info.get("h_trn_no", "")), train_no):
            continue
        dep_dt = str(info.get("h_dpt_dt") or "")
        dep_tm = str(info.get("h_dpt_tm") or "")
        name = str(info.get("h_trn_clsf_nm") or "KTX")
        psb = str(info.get("h_rsv_psb_nm") or "").replace("\n", " ").strip()
        state = AVAILABLE if info.get("h_gen_rsv_cd") == SEAT_AVAILABLE else SOLD_OUT
        label = "일반실 예약 가능" if state == AVAILABLE else "일반실 매진"
        return {
            "state": state,
            "summary": f"{name} {train_no} {label}" + (f" ({psb})" if psb else ""),
            "departure": dep_dt + dep_tm if len(dep_dt) == 8 and len(dep_tm) == 6 else None,
        }
    return {"state": UNKNOWN, "summary": f"조회 결과에 열차 {train_no} 없음 ({len(infos)}개 열차)"}


def decide(prev: str | None, cur: str) -> str | None:
    """알릴 전환이면 'available' / 'soldout', 아니면 None. UNKNOWN 은 직전 상태를 바꾸지 않는다."""
    if cur == AVAILABLE and prev != AVAILABLE:
        return "available"
    if cur == SOLD_OUT and prev == AVAILABLE:
        return "soldout"
    return None


def departure_at(cfg: Config, state: dict[str, Any]) -> datetime:
    """출발 시각(KST). 응답에서 알아낸 값이 없으면 그날 23:59 로 본다."""
    raw = state.get("departure")
    if raw:
        try:
            return datetime.strptime(raw, "%Y%m%d%H%M%S").replace(tzinfo=KST)
        except ValueError:
            pass
    return datetime.strptime(cfg.date + "235900", "%Y%m%d%H%M%S").replace(tzinfo=KST)


def trip_label(cfg: Config, state: dict[str, Any]) -> str:
    d = datetime.strptime(cfg.date, "%Y%m%d")
    dep = state.get("departure")
    hhmm = f" {dep[8:10]}:{dep[10:12]}" if dep else ""
    return f"{d.month}/{d.day}({WEEKDAYS[d.weekday()]}) {cfg.dep}{hhmm} → {cfg.arr}"


def build_message(kind: str, cfg: Config, state: dict[str, Any], checked: datetime) -> str:
    trip = trip_label(cfg, state)
    seat = f"일반실 · 성인 {cfg.adults}명"
    at = checked.strftime("%H:%M")
    if kind == "available":
        return f"🚄 KTX {cfg.train_no} 예약 가능!\n{trip}\n{seat}\n코레일톡에서 바로 예매하세요. ({at} 조회)"
    if kind == "soldout":
        return f"😢 KTX {cfg.train_no} 다시 매진\n{trip}\n{seat}\n자리가 다시 나면 알려 드릴게요. ({at} 조회)"
    return f"🔔 KTX {cfg.train_no} 감시 알림 테스트\n{trip}\n{seat}"


def load_state(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_state(path: Path, state: dict[str, Any]) -> None:
    # 쓰는 도중 끝나도 파일이 잘리지 않게 임시 파일에 쓴 뒤 바꿔 끼운다
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


class Watcher:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.state = load_state(cfg.state_file)
        self.errors = 0
        self.notify_failing = False

    def agent(self, status: str, message: str, label: str | None = None) -> None:
        post_status(self.cfg.agent_id, status, message, on_error=log, name=self.cfg.agent_name, label=label)

    def check(self) -> None:
        """1회 조회 → 판정 → (전환이면) 알림 → 상태 저장."""
        checked = now_kst()
        # 다른 프로세스(once 등)가 바꿨을 수 있으니 매번 파일 기준으로 판정한다
        self.state = load_state(self.cfg.state_file) or self.state
        try:
            result = judge(fetch_schedule(self.cfg), self.cfg.train_no)
        except Exception as e:
            reason = str(e.__cause__ or e.__context__ or e).split(" (Caused by ")[-1]
            result = {"state": UNKNOWN, "summary": f"조회 에러({type(e).__name__}): {reason[:150]}"}

        cur = result["state"]
        prev = self.state.get("last")
        log(f"상태: {cur} (직전 {prev or '-'}) | {result['summary']}")

        if cur == UNKNOWN:
            self.errors += 1
            if self.errors == ERROR_ALERT_AFTER:
                self.agent("ERROR", f"KTX {self.cfg.train_no} 조회가 {self.errors}번 연속 실패: {result['summary']}")
            else:
                self.agent("WORKING", f"⚠ 조회 에러(재시도 예정, {self.errors}회): {result['summary']}")
            return
        self.errors = 0
        if result.get("departure"):
            self.state["departure"] = result["departure"]

        kind = decide(prev, cur)
        if kind:
            text = build_message(kind, self.cfg, self.state, checked)
            log(f">>> 전환 알림({kind}) 카카오톡 발송")
            if not send_to_me(text, on_error=log):
                # 판정을 저장하지 않아 다음 주기에 다시 보낸다. 에이전트 ERROR 는 실패가 이어지는 동안 1번만
                if not self.notify_failing:
                    self.agent("ERROR", f"KTX {self.cfg.train_no} {result['summary']} — 카카오톡 발송 실패(재시도 예정)")
                self.notify_failing = True
                return
            self.notify_failing = False
            self.state["notified_at"] = checked.isoformat(timespec="seconds")
            self.state["notified_kind"] = kind

        self.state["last"] = cur
        self.state["checked_at"] = checked.isoformat(timespec="seconds")
        save_state(self.cfg.state_file, self.state)

        if kind == "available":
            self.agent("COMPLETE", f"✅ {result['summary']}! 카톡 보냄 · 감시 계속 ({checked:%H:%M})")
        elif kind == "soldout":
            self.agent("WORKING", f"😢 다시 매진, 감시 계속 ({checked:%H:%M})")
        else:
            self.agent("WORKING", f"감시 중… {result['summary']} ({checked:%H:%M})")

    def departed(self) -> bool:
        return now_kst() >= departure_at(self.cfg, self.state)


_stop_requested = False


def _stop(signum, frame):  # noqa: ARG001
    """SIGTERM(stop): 하던 조회 · 알림 · 저장을 마친 뒤 루프에서 끝낸다 (중간에 끊으면 알림이 중복될 수 있다)."""
    global _stop_requested
    _stop_requested = True


def _sleep(seconds: int) -> None:
    end = time.monotonic() + seconds
    while not _stop_requested and time.monotonic() < end:
        time.sleep(min(1.0, end - time.monotonic()))


def main() -> int:
    parser = argparse.ArgumentParser(description="KTX 잔여석 감시")
    parser.add_argument("--dep", help=f"출발역 (기본 {DEFAULTS['dep']})")
    parser.add_argument("--arr", help=f"도착역 (기본 {DEFAULTS['arr']})")
    parser.add_argument("--date", help=f"출발일 yyyyMMdd (기본 {DEFAULTS['date']})")
    parser.add_argument("--time", help=f"조회 기준 시각 HHmmss (기본 {DEFAULTS['time']})")
    parser.add_argument("--train-no", dest="train_no", help=f"열차번호 (기본 {DEFAULTS['train_no']})")
    parser.add_argument("--adults", type=int, help=f"성인 인원 (기본 {DEFAULTS['adults']})")
    parser.add_argument("--interval", type=int, help=f"조회 간격(초), 최소 {MIN_INTERVAL} (기본 {DEFAULTS['interval']})")
    parser.add_argument("--once", action="store_true", help="1회만 확인 (전환이면 알림도 보낸다)")
    parser.add_argument("--test-notify", action="store_true", help="카카오톡 발송만 테스트")
    args = parser.parse_args()
    cfg = resolve_config(args)

    watcher = Watcher(cfg)
    if args.test_notify:
        ok = send_to_me(build_message("test", cfg, watcher.state, now_kst()), on_error=log)
        log("테스트 발송 " + ("성공" if ok else "실패"))
        return 0 if ok else 1

    signal.signal(signal.SIGTERM, _stop)
    log(
        f"감시 시작: {cfg.dep}→{cfg.arr} {cfg.date} {cfg.time} 열차 {cfg.train_no} 성인 {cfg.adults}"
        f" / 간격 {cfg.interval}s / 상태파일 {cfg.state_file.name} (직전 {watcher.state.get('last', '-')})"
    )
    if watcher.departed():
        log("출발 시각이 지나 감시하지 않습니다.")
        return 0

    if args.once:
        watcher.check()
        return 0

    watcher.agent("WORKING", f"출근 완료! {trip_label(cfg, watcher.state)} KTX {cfg.train_no} 잔여석 감시 시작 🚄")
    try:
        while not _stop_requested:
            watcher.check()
            if watcher.departed():
                log("출발 시각이 지나 감시를 끝냅니다.")
                watcher.agent("IDLE", f"KTX {cfg.train_no} 출발 시각이 지나 감시 종료", label="감시 끝났습니다!🚉")
                return 0
            _sleep(cfg.interval)
    except KeyboardInterrupt:  # 터미널에서 Ctrl+C
        pass
    log("종료 신호를 받아 감시를 멈춥니다.")
    watcher.agent("IDLE", f"KTX {cfg.train_no} 감시를 멈췄습니다", label="퇴근했습니다!😁")
    return 0


if __name__ == "__main__":
    sys.exit(main())

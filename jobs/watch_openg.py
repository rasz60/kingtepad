#!/usr/bin/env python3
"""
나라장터 개찰결과 감시 배치
- 공고번호(BID_NO) 개찰결과 분류조회에서 결과 목록이 채워지면 알림
- 나라장터 개찰결과 분류조회 내부 API를 주기적으로 폴링해서 판단

BID_NO 지정 우선순위:
  1) CLI --bid-no
  2) 환경변수 BID_NO (또는 G2B_BID_NO)
  3) 기본값 R26BK01630788

예시:
  python watch_openg.py --bid-no R26BK01630788
  BID_NO=R26XXXX python watch_openg.py
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, build_opener, HTTPCookieProcessor
from http.cookiejar import CookieJar

from monitor_client import post_status

DEFAULT_BID_NO = "R26BK01630788"
DEFAULT_BID_ORD = "000"
WAITING_TEXT = "조회 결과가 없습니다."
G2B_BASE = "https://www.g2b.go.kr"

# 에이전트 모니터 연동 설정
AGENT_ID = "G2BWatcherAgent"
OPENG_URL = f"{G2B_BASE}/pb/pbo/pboc/OnbsRslt/selectOnbsRsltClsfList.do"
MENU_INFO = (
    '{"menuNo":"01522","menuCangVal":"PBOC006_01",'
    '"bsneClsfCd":"%EC%97%85130028","scrnNo":"02117"}'
)
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
KST = timezone(timedelta(hours=9))

# main()에서 resolve 후 설정
BID_NO = DEFAULT_BID_NO
BID_ORD = DEFAULT_BID_ORD
DETAIL_LINK = ""
STATE_FILE = Path(__file__).with_name("watch_state.json")
LOG_FILE = Path(__file__).with_name("watch.log")


def resolve_bid_config(args: argparse.Namespace) -> tuple[str, str]:
    """CLI > 환경변수 > 기본값 순으로 BID_NO / BID_ORD 를 결정한다."""
    bid_no = (
        (args.bid_no or "").strip()
        or os.environ.get("BID_NO", "").strip()
        or os.environ.get("G2B_BID_NO", "").strip()
        or DEFAULT_BID_NO
    )
    bid_ord = (
        (args.bid_ord or "").strip()
        or os.environ.get("BID_ORD", "").strip()
        or os.environ.get("G2B_BID_ORD", "").strip()
        or DEFAULT_BID_ORD
    )
    return bid_no, bid_ord


def apply_bid_config(bid_no: str, bid_ord: str) -> None:
    """전역 BID 관련 경로/링크를 현재 공고번호에 맞게 갱신한다."""
    global BID_NO, BID_ORD, DETAIL_LINK, STATE_FILE
    BID_NO = bid_no
    BID_ORD = bid_ord
    DETAIL_LINK = (
        f"{G2B_BASE}/link/PNPE027_01/single/"
        f"?bidPbancNo={BID_NO}&bidPbancOrd={BID_ORD}"
    )
    # 공고번호별로 상태를 분리해, BID_NO 를 바꿔도 이전 감시 완료 상태가 섞이지 않게 한다.
    STATE_FILE = Path(__file__).with_name(f"watch_state_{BID_NO}.json")


def now() -> str:
    # 서버 시스템 시간대(클라우드는 보통 UTC)와 무관하게 로그에는 항상 KST를 찍는다.
    return datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")


def log(msg: str) -> None:
    line = f"[{now()}] {msg}"
    print(line, flush=True)
    try:
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def notify(title: str, message: str) -> None:
    """Windows 알림: 메시지박스 + 브라우저 열기."""
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(0, message, title, 0x40 | 0x1000)
    except Exception as e:
        log(f"MessageBox 실패: {e}")

    try:
        os.startfile(DETAIL_LINK)  # noqa: S606
    except Exception:
        pass


def update_pixel_agent(status: str, message: str) -> None:
    """에이전트 모니터(kingtepad API)로 상태를 보내 픽셀 오피스 캐릭터에 반영한다."""
    post_status(AGENT_ID, status, message, on_error=log)


def load_state() -> dict[str, Any]:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}

    # 예전 단일 watch_state.json 호환: 같은 BID_NO 로 이미 알림을 보냈다면 이관
    legacy = Path(__file__).with_name("watch_state.json")
    if legacy.exists():
        try:
            data = json.loads(legacy.read_text(encoding="utf-8"))
            if data.get("alerted") and data.get("bid_no") in (None, BID_NO):
                return data
        except Exception:
            pass
    return {}


def save_state(state: dict[str, Any]) -> None:
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


class G2bClient:
    def __init__(self, bid_no: str) -> None:
        self.bid_no = bid_no
        self.cj = CookieJar()
        self.opener = build_opener(HTTPCookieProcessor(self.cj))
        self._refresh_session()

    def _refresh_session(self) -> None:
        req = Request(f"{G2B_BASE}/", headers={"User-Agent": UA})
        with self.opener.open(req, timeout=30) as r:
            r.read()

    def fetch_openg(self) -> dict[str, Any]:
        today = datetime.now()
        onbs_ymd_str = (today - timedelta(days=400)).strftime("%Y%m%d")
        onbs_ymd_end = (today + timedelta(days=400)).strftime("%Y%m%d")
        body = {
            "dlSrchOnbsRsltClsfListInM": {
                "bidPbancNo": self.bid_no,
                "bidPbancOrd": "",
                "bidPbancNm": "",
                "onbsYmdStr": onbs_ymd_str,
                "onbsYmdEnd": onbs_ymd_end,
                "prcmBsneSeCd": "0000 조070001 조070002 조070003 조070004 조070005",
                "frcpYn": "Y",
                "rsrvYn": "Y",
                "laseYn": "Y",
                "chkBsneAllYn": "Y",
                "lastIndex": 10,
                "firstIndex": 1,
                "inqEnd": "Y",
                "stepBarYn": "",
                "pbancKndCd": "공440002",
            }
        }
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers = {
            "User-Agent": UA,
            "Content-Type": "application/json;charset=UTF-8",
            "Menu-Info": MENU_INFO,
            "Referer": f"{G2B_BASE}/",
            "Accept": "application/json, text/plain, */*",
            "Origin": G2B_BASE,
        }

        def _do() -> tuple[int, str]:
            req = Request(OPENG_URL, data=data, headers=headers, method="POST")
            try:
                with self.opener.open(req, timeout=30) as r:
                    return r.status, r.read().decode("utf-8", errors="replace")
            except HTTPError as e:
                return e.code, e.read().decode("utf-8", errors="replace")

        status, text = _do()
        if status == 403:
            self._refresh_session()
            status, text = _do()

        payload: Any
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            payload = {"__raw": text[:500]}

        return {"status": status, "payload": payload, "raw": text}


def analyze_api(resp: dict[str, Any]) -> dict[str, Any]:
    """
    waiting=True  : 아직 개찰결과 분류 목록이 비어 있음(대기)
    ready=True    : 개찰결과 분류 목록이 채워짐 → 알림 대상
    error=True    : 세션 만료/서버 오류 등 판단 불가 → 알리지 않고 다음 주기에 재시도
    """
    status = resp["status"]
    payload = resp["payload"]
    raw = resp.get("raw", "")

    if status != 200 or not isinstance(payload, dict):
        return {
            "waiting": True,
            "ready": False,
            "error": True,
            "summary": f"응답 확인 필요(HTTP {status}) {raw[:120]}",
            "result_count": 0,
        }

    err_code = payload.get("ErrorCode")
    err_msg = str(payload.get("ErrorMsg") or "")

    if err_code not in (0, "0", None):
        return {
            "waiting": True,
            "ready": False,
            "error": True,
            "summary": f"조회 오류(ErrorCode={err_code}) {err_msg}",
            "result_count": 0,
        }

    result = payload.get("result") or {}
    clsf_list = result.get("onbsRsltClsfList") or []

    if not clsf_list:
        return {
            "waiting": True,
            "ready": False,
            "summary": WAITING_TEXT,
            "result_count": 0,
        }

    return {
        "waiting": False,
        "ready": True,
        "summary": f"개찰결과 분류 {len(clsf_list)}건 확인됨",
        "result_count": len(clsf_list),
        "payload": payload,
    }


def once(bid_no: str) -> dict[str, Any]:
    client = G2bClient(bid_no)
    api_resp = client.fetch_openg()
    return {"api": analyze_api(api_resp)}


def should_alert(check: dict[str, Any]) -> tuple[bool, str]:
    api = check["api"]
    if api.get("ready"):
        return True, api["summary"]
    return False, api.get("summary") or WAITING_TEXT


def main() -> int:
    parser = argparse.ArgumentParser(description="나라장터 개찰결과 감시")
    parser.add_argument("--interval", type=int, default=60, help="폴링 간격(초), 기본 60")
    parser.add_argument("--once", action="store_true", help="1회만 확인")
    parser.add_argument("--test-notify", action="store_true", help="알림만 테스트")
    parser.add_argument(
        "--bid-no",
        default=None,
        help=f"공고번호 (미지정 시 env BID_NO / 기본값 {DEFAULT_BID_NO})",
    )
    parser.add_argument(
        "--bid-ord",
        default=None,
        help=f"공고차수 (미지정 시 env BID_ORD / 기본값 {DEFAULT_BID_ORD})",
    )
    args = parser.parse_args()

    bid_no, bid_ord = resolve_bid_config(args)
    apply_bid_config(bid_no, bid_ord)

    if args.test_notify:
        notify("나라장터 알림 테스트", f"{BID_NO} 알림 테스트입니다.")
        return 0

    # 이미 개찰결과를 확인해서 알림까지 보낸 뒤라면, 그 무엇도(출근 말풍선/G2B 조회) 하지 않고
    # 바로 종료한다. pm2가 재배포/재시작 때마다 이 프로세스를 다시 띄우더라도 실질적으로는
    # "실행되지 않은 것"과 같게 만들어서, 감시가 다시 시작되거나 알림이 중복되지 않게 한다.
    state = load_state()
    if state.get("alerted"):
        log(
            "이미 개찰결과 확인이 완료된 상태입니다"
            f" ({state.get('summary', '')}). 재감시하려면 {STATE_FILE.name} 을 삭제하세요."
        )
        return 0

    log(f"감시 시작: {BID_NO}-{BID_ORD} / 간격 {args.interval}s")
    log(f"상세링크: {DETAIL_LINK}")
    log(f"상태파일: {STATE_FILE.name}")

    update_pixel_agent(
        "WORKING",
        f"출근 완료! 나라장터 개찰결과({BID_NO}) 감시를 시작합니다 📋",
    )

    while True:
        try:
            check = once(BID_NO)
            alert, summary = should_alert(check)
            api = check["api"]
            log(f"상태: waiting={not alert} | {summary} | 결과건수={api.get('result_count', 0)}")

            if alert:
                msg = (
                    f"공고 {BID_NO}\n"
                    f"{summary}\n\n"
                    f"나라장터 상세를 확인하세요.\n{DETAIL_LINK}"
                )
                log(">>> 알림 조건 충족! 알림 전송")
                notify("나라장터 개찰결과 변경", msg)
                # 실패/에러가 아니라 "더 이상 감시할 필요가 없어진, 정상적인 완료"이므로 ERROR가
                # 아니라 COMPLETE로 보낸다. pixelAgentsBridge는 이걸 Stop 훅으로 처리해서 캐릭터를
                # 바로 유휴 상태로 되돌리고, 대시보드 알림(토스트/파비콘/알림)도 그대로 뜬다.
                update_pixel_agent("COMPLETE", f"✅ 개찰결과 공개! {summary} ({BID_NO})")
                save_state(
                    {
                        "alerted": True,
                        "alerted_at": now(),
                        "summary": summary,
                        "bid_no": BID_NO,
                        "bid_ord": BID_ORD,
                    }
                )
                # 결과 스냅샷 저장
                snap = Path(__file__).with_name(f"openg_result_{BID_NO}.json")
                snap.write_text(
                    json.dumps(check, ensure_ascii=False, indent=2, default=str),
                    encoding="utf-8",
                )
                return 0

            update_pixel_agent("WORKING", f"감시 중... {summary}")

        except Exception as e:
            log(f"오류(다음 주기에 재시도): {e}")
            update_pixel_agent("WORKING", f"⚠ 조회 에러(재시도 예정): {e}")

        if args.once:
            return 0

        time.sleep(max(10, args.interval))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        # pm2가 재배포/재시작 시 SIGINT를 보내는 정상적인 종료 경로라, 트레이스백 없이 조용히 끝낸다.
        print("\n👋 종료 신호를 받아 정상적으로 종료합니다.")
        sys.exit(0)

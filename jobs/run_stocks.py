"""
여러 종목의 KIS 현재가를 REST API로 주기적으로 폴링해서 pixel-agents 상태를 갱신하는 실행 파일.

- 장 진행 중: 주기마다 시세를 조회해 agent status = WORKING 으로 보낸다.
- 장 마감/휴장: 장이 닫히는 순간(또는 장 밖에서 처음 실행됐을 때) 종가를 한 번 조회해
  IDLE 로 "장 마감" 메시지를 딱 한 번 보낸다. 이후에는 시세 조회도 상태 전송도 하지 않고
  1분마다 장이 열렸는지만 확인한다. (IDLE 캐릭터는 픽셀 오피스를 자유롭게 돌아다닌다)
- 휴장일(공휴일·연말 등)은 KIS 국내휴장일조회 API로 하루 한 번 확인한다.

종목 추가:
    jobs/stocks.json 에 {"code": "종목코드", "name": "표시명"} 한 줄만 추가하면 된다.
    agentId 는 자동으로 StockAgent_<code> 로 생성된다.

실행:
    python run_stocks.py
"""

from __future__ import annotations

import json
import os
import time
import datetime
from pathlib import Path
from types import SimpleNamespace

import requests

import kis_credentials as kis
from monitor_client import post_status

# ==========================================
# 1. 종목 목록 (stocks.json)
# ==========================================
STOCKS_FILE = Path(__file__).with_name("stocks.json")


def load_stocks():
    """stocks.json 을 읽어 종목 목록을 만든다. 추가/삭제는 JSON만 수정하면 된다."""
    raw = json.loads(STOCKS_FILE.read_text(encoding="utf-8"))
    stocks = []
    for item in raw:
        code = str(item["code"]).strip()
        name = str(item.get("name") or code).strip()
        agent_id = str(item.get("agent_id") or f"StockAgent_{code}").strip()
        stocks.append(SimpleNamespace(STOCK_CODE=code, STOCK_NAME=name, AGENT_ID=agent_id))
    if not stocks:
        raise SystemExit(f"종목이 비어 있습니다: {STOCKS_FILE}")
    return stocks


STOCKS = load_stocks()

# ==========================================
# 2. 공용 설정
# ==========================================
POLL_INTERVAL = 6.0  # 종목 전체를 한 바퀴 도는 주기(초). 종목이 늘어나면 호출 빈도가 자동으로 분산됨.
CLOSED_CHECK_INTERVAL = 60.0  # 장 밖에서 장이 열렸는지 다시 확인하는 주기(초)
HOLIDAY_RETRY_SEC = 600  # 휴장일 조회가 실패했을 때 다시 시도하기까지(초). 그동안은 평일=개장으로 본다
ALERT_STEP = 5.0  # 몇 %p 단위로 급등/급락 알람을 띄울지 (5% 단위 -> ±5, ±10, ±15, ...)

# pm2 재시작 등으로 프로세스가 새로 뜨면 메모리 캐시(ACCESS_TOKEN)가 사라지는데, 그때마다
# KIS에 새 토큰을 요청하면 "너무 자주 재발급 요청함"으로 403이 날 수 있다. 그래서 파일에도
# 캐싱해서 아직 유효한 토큰이 있으면 프로세스가 재시작돼도 재사용한다. (git에는 커밋되지 않음)
TOKEN_CACHE_FILE = Path(__file__).with_name(".kis_token_cache.json")

KST = datetime.timezone(datetime.timedelta(hours=9))

agent_states = {s.AGENT_ID: "HOME" for s in STOCKS}  # HOME, WORKING, IDLE
last_status_text = {s.AGENT_ID: None for s in STOCKS}
alert_level = {s.AGENT_ID: 0 for s in STOCKS}
ACCESS_TOKEN = None
ACCESS_TOKEN_EXPIRES_AT = 0.0
# 휴장일 조회 캐시: {"date": "YYYYMMDD", "open": bool, "retry_at": 실패 시 재조회 시각}
_trading_day = {"date": None, "open": True, "retry_at": 0.0}


# ==========================================
# 3. Helper 함수: 에이전트 모니터(kingtepad API)로 상태 전송
# ==========================================
def update_pixel_agent(agent_id, status, message):
    post_status(agent_id, status, message)


def is_market_open():
    """평일 09:00 ~ 15:30(KST) 장중 여부 체크.

    datetime.now()는 서버의 시스템 시간대를 그대로 쓰는데, 클라우드 서버는 보통 UTC로
    설정되어 있어서(한국시간 15:22 = UTC 06:22) 그냥 now()를 쓰면 실제로는 장중인데도
    "아직 9시 전"으로 잘못 판단해 시세 조회를 계속 건너뛰는 버그가 있었다. 그래서 서버
    시간대와 무관하게 항상 KST(UTC+9) 기준으로 명시적으로 계산한다.

    장 마감 후에도 시세가 갱신되지 않으므로, 개발 중 아무 때나 파이프라인
    (Python -> kingtepad API -> pixel-agents 말풍선)을 테스트하고 싶다면 환경변수
    FORCE_MARKET_OPEN=1로 이 체크를 건너뛸 수 있다.
    """
    if os.environ.get("FORCE_MARKET_OPEN") == "1":
        return True

    now = datetime.datetime.now(KST)
    if now.weekday() >= 5:  # 토/일요일 제외
        return False

    start_time = now.replace(hour=9, minute=0, second=0, microsecond=0)
    end_time = now.replace(hour=15, minute=30, second=0, microsecond=0)
    # 장 시간 안일 때만 휴장일을 조회한다 (하루 한 번, 캐시)
    return start_time <= now <= end_time and is_trading_day(now)


def format_status(stock, output):
    """KIS 현재가 조회 응답을 말풍선 텍스트로 변환."""
    price = int(output["stck_prpr"])
    sign = output["prdy_vrss_sign"]
    change_rate = float(output["prdy_ctrt"])
    arrow = "🔺" if sign in ("1", "2") else ("🔻" if sign in ("4", "5") else "➖")
    return f"{stock.STOCK_NAME} {price:,}원 {arrow} ({change_rate:.2f}%)"


# ==========================================
# 4. KIS REST API 호출
# ==========================================
def _load_cached_token():
    try:
        data = json.loads(TOKEN_CACHE_FILE.read_text(encoding="utf-8"))
        expires_at = data.get("expires_at", 0)
        if data.get("access_token") and time.time() < expires_at:
            return data["access_token"], expires_at
    except (FileNotFoundError, json.JSONDecodeError, KeyError, OSError):
        pass
    return None, 0.0


def _save_cached_token(token, expires_at):
    try:
        TOKEN_CACHE_FILE.write_text(
            json.dumps({"access_token": token, "expires_at": expires_at}),
            encoding="utf-8",
        )
    except OSError as e:
        print(f"[토큰 캐시 저장 실패] {e}")


def get_access_token():
    """KIS REST API 접근토큰 발급 (유효기간 1일, 만료 5분 전 자동 재발급)."""
    global ACCESS_TOKEN, ACCESS_TOKEN_EXPIRES_AT
    if ACCESS_TOKEN and time.time() < ACCESS_TOKEN_EXPIRES_AT:
        return ACCESS_TOKEN

    cached_token, cached_expires_at = _load_cached_token()
    if cached_token:
        ACCESS_TOKEN, ACCESS_TOKEN_EXPIRES_AT = cached_token, cached_expires_at
        return ACCESS_TOKEN

    url = f"{kis.REST_DOMAIN}/oauth2/tokenP"
    headers = {"content-type": "application/json"}
    body = {
        "grant_type": "client_credentials",
        "appkey": kis.APP_KEY,
        "appsecret": kis.APP_SECRET,
    }
    res = requests.post(url, headers=headers, json=body, timeout=5)
    res.raise_for_status()
    data = res.json()
    ACCESS_TOKEN = data["access_token"]
    ACCESS_TOKEN_EXPIRES_AT = time.time() + int(data.get("expires_in", 86400)) - 300
    _save_cached_token(ACCESS_TOKEN, ACCESS_TOKEN_EXPIRES_AT)
    return ACCESS_TOKEN


def fetch_price(stock):
    """KIS REST 주식현재가 시세 조회 (TR ID: FHKST01010100)"""
    url = f"{kis.REST_DOMAIN}/uapi/domestic-stock/v1/quotations/inquire-price"
    headers = {
        "content-type": "application/json",
        "authorization": f"Bearer {get_access_token()}",
        "appkey": kis.APP_KEY,
        "appsecret": kis.APP_SECRET,
        "tr_id": "FHKST01010100",
        "custtype": "P",
    }
    params = {
        "fid_cond_mrkt_div_code": "J",
        "fid_input_iscd": stock.STOCK_CODE,
    }
    res = requests.get(url, headers=headers, params=params, timeout=5)
    res.raise_for_status()
    data = res.json()
    if data.get("rt_cd") != "0":
        raise RuntimeError(f"{data.get('msg_cd')}: {data.get('msg1')}")
    return data["output"]


def is_trading_day(now):
    """KIS 국내휴장일조회(TR ID: CTCA0903R)로 오늘이 개장일인지 확인한다.

    KIS 가 하루 1회 호출을 권장하므로 날짜별로 캐시한다. 조회가 실패하면(모의투자 도메인은
    이 API 를 지원하지 않음) 평일은 개장으로 보고, HOLIDAY_RETRY_SEC 뒤에 다시 시도한다.
    """
    today = now.strftime("%Y%m%d")
    cache = _trading_day
    # 오늘 조회에 성공했거나(retry_at=0), 실패 후 재시도 시각 전이면 캐시를 쓴다
    if cache["date"] == today and (not cache["retry_at"] or time.time() < cache["retry_at"]):
        return cache["open"]

    url = f"{kis.REST_DOMAIN}/uapi/domestic-stock/v1/quotations/chk-holiday"
    headers = {
        "content-type": "application/json",
        "authorization": f"Bearer {get_access_token()}",
        "appkey": kis.APP_KEY,
        "appsecret": kis.APP_SECRET,
        "tr_id": "CTCA0903R",
        "custtype": "P",
    }
    params = {"BASS_DT": today, "CTX_AREA_NK": "", "CTX_AREA_FK": ""}
    try:
        res = requests.get(url, headers=headers, params=params, timeout=5)
        res.raise_for_status()
        data = res.json()
        if data.get("rt_cd") != "0":
            raise RuntimeError(f"{data.get('msg_cd')}: {data.get('msg1')}")
        row = next(r for r in data["output"] if r.get("bass_dt") == today)
        opened = row.get("opnd_yn") == "Y"
        cache.update(date=today, open=opened, retry_at=0.0)
        print(f"📅 {today} {'개장일' if opened else '휴장일'} (KIS 휴장일조회)")
    except Exception as e:
        cache.update(date=today, open=True, retry_at=time.time() + HOLIDAY_RETRY_SEC)
        print(f"[휴장일 조회 실패 → 평일은 개장으로 간주] {e}")
    return cache["open"]


# ==========================================
# 5. 급등/급락 알람 로직
# ==========================================
def signed_change_rate(output):
    """전일대비율(%)에 부호를 명시적으로 적용해서 반환한다."""
    magnitude = abs(float(output["prdy_ctrt"]))
    return -magnitude if output.get("prdy_vrss_sign") in ("4", "5") else magnitude


def compute_alert_level(rate):
    """rate(%)가 속한 ALERT_STEP 단위 구간을 반환한다. 예: -5.3 -> -5, -12.1 -> -10, 3.0 -> 0"""
    step = int(ALERT_STEP)
    magnitude = int(abs(rate) // ALERT_STEP) * step
    if magnitude == 0:
        return 0
    return magnitude if rate > 0 else -magnitude


def build_alert_message(stock_name, prev_level, curr_level, rate):
    """알람 말풍선 텍스트를 만든다. 직전 구간보다 더 벌어졌으면 급등/급락, 좁아졌으면 회복."""
    if abs(curr_level) > abs(prev_level):
        direction = "급등" if curr_level > 0 else "급락"
        return f"🚨 {stock_name} {direction} 감지! {curr_level:+d}% 단계 진입 (현재 {rate:+.2f}%)"
    return f"✅ {stock_name} 회복 알람 (현재 {rate:+.2f}%)"


# ==========================================
# 6. 메인 루프: 장중엔 주기적으로 조회해 WORKING, 장이 닫히면 IDLE 한 번 보내고 조용히 대기
# ==========================================
def announce_close():
    """장 마감(또는 장 밖에서 시작)을 종목마다 한 번만 알린다. 종가는 이때 한 번만 조회한다."""
    for stock in STOCKS:
        if agent_states[stock.AGENT_ID] == "IDLE":
            continue
        try:
            closing = format_status(stock, fetch_price(stock))
            last_status_text[stock.AGENT_ID] = closing
        except Exception as e:
            print(f"[{stock.STOCK_NAME}] 종가 조회 에러: {e}")
            closing = last_status_text.get(stock.AGENT_ID)
        message = f"🔔 장 마감 — {closing}" if closing else f"🔔 장 마감 — {stock.STOCK_NAME}"
        agent_states[stock.AGENT_ID] = "IDLE"
        print(f"[{stock.STOCK_NAME}] {message}")
        update_pixel_agent(stock.AGENT_ID, "IDLE", f"{message} · 다음 개장 때 다시 출근할게요 💤")
        time.sleep(max(POLL_INTERVAL / len(STOCKS), 0.5))


def poll_loop():
    while True:
        if not is_market_open():
            # 장이 닫힌 동안에는 시세 조회도 상태 전송도 하지 않는다 (마감 알림은 처음 한 번만)
            announce_close()
            time.sleep(CLOSED_CHECK_INTERVAL)
            continue

        interval_per_stock = max(POLL_INTERVAL / len(STOCKS), 0.5)
        for stock in STOCKS:
            try:
                output = fetch_price(stock)
                status_text = format_status(stock, output)
                last_status_text[stock.AGENT_ID] = status_text
                print(f"[{stock.STOCK_NAME}] 장중 | {status_text}")

                if agent_states[stock.AGENT_ID] != "WORKING":
                    agent_states[stock.AGENT_ID] = "WORKING"
                    alert_level[stock.AGENT_ID] = 0
                    print(f"⏰ {stock.STOCK_NAME} 출근합니다.")
                    update_pixel_agent(
                        agent_id=stock.AGENT_ID,
                        status="WORKING",
                        message=f"출근 완료! {stock.STOCK_NAME} 모니터링을 시작합니다 📈",
                    )

                rate = signed_change_rate(output)
                current_level = compute_alert_level(rate)
                prev_level = alert_level[stock.AGENT_ID]
                if current_level != prev_level:
                    alert_msg = build_alert_message(stock.STOCK_NAME, prev_level, current_level, rate)
                    print(f"[{stock.STOCK_NAME}] {alert_msg}")
                    update_pixel_agent(stock.AGENT_ID, "WARNING", alert_msg)
                    alert_level[stock.AGENT_ID] = current_level

                update_pixel_agent(stock.AGENT_ID, "WORKING", status_text)
            except Exception as e:
                print(f"[{stock.STOCK_NAME}] 시세 조회 에러: {e}")
                update_pixel_agent(stock.AGENT_ID, "WORKING", f"⚠ 시세 조회 에러(재시도 예정): {e}")

            time.sleep(interval_per_stock)


# ==========================================
# 7. 메인 실행부
# ==========================================
if __name__ == "__main__":
    try:
        get_access_token()
        print("🔑 KIS REST 접근토큰(access_token) 발급 완료")
    except Exception as e:
        print(f"❌ 접근토큰 발급 실패: {e}")
        print("   kis_credentials.py의 APP_KEY / APP_SECRET 값을 확인하세요.")
        raise SystemExit(1)

    # 시작 상태는 첫 루프가 정한다: 장중이면 "출근 완료", 장 밖이면 "장 마감" 한 번
    names = ", ".join(f"{s.STOCK_NAME}({s.STOCK_CODE})" for s in STOCKS)
    print(
        f"🚀 Stock Pixel Agents 실행 중 (REST 폴링, 종목당 약 {POLL_INTERVAL}s 주기)... [{names}]"
    )
    print(f"📋 종목 설정 파일: {STOCKS_FILE}")
    try:
        poll_loop()
    except KeyboardInterrupt:
        print("\n👋 종료 신호를 받아 정상적으로 종료합니다.")

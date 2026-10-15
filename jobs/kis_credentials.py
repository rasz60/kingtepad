"""
KIS(한국투자증권) Developer API 공용 인증/접속 정보.

run_stocks.py는 REST 현재가 조회 API(FHKST01010100)를 주기적으로 폴링하는 방식이라
appkey 하나로 원하는 만큼의 종목을 동시에 모니터링할 수 있습니다. (참고: 실시간
웹소켓은 이 계정 기준 연결당 tr_key 1개만 등록 가능해 여러 종목 구독이 불가능했음)

APP_KEY/APP_SECRET은 절대 코드에 하드코딩하지 않고 jobs/.env(git에 커밋되지
않음)에서 읽어옵니다. .env.example을 복사해서 본인 값으로 채워주세요.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# 실행 위치와 무관하게 이 파일 옆의 jobs/.env 를 읽는다.
load_dotenv(Path(__file__).resolve().parent / ".env")

APP_KEY = os.environ.get("KIS_APP_KEY")
APP_SECRET = os.environ.get("KIS_APP_SECRET")

if not APP_KEY or not APP_SECRET:
    raise RuntimeError(
        "KIS_APP_KEY / KIS_APP_SECRET이 설정되지 않았습니다. "
        "jobs/.env 파일에 값을 채워주세요 (jobs/.env.example 참고)."
    )

# REST API 도메인 (실전계좌: https://openapi.koreainvestment.com:9443 / 모의투자: https://openapivts.koreainvestment.com:29443)
REST_DOMAIN = os.environ.get("KIS_REST_DOMAIN", "https://openapi.koreainvestment.com:9443")

# 실시간 WebSocket URL (참고용, run_stocks.py는 더 이상 사용하지 않음)
WS_URL = os.environ.get("KIS_WS_URL", "ws://ops.koreainvestment.com:21000")

"""
에이전트 모니터(kingtepad API) 로 배치 작업 상태를 보내는 공용 함수.

설정 (jobs/.env 또는 환경변수):
  MONITOR_STATUS_URL    기본 http://127.0.0.1:8080/monitor/status
  MONITOR_INGEST_TOKEN  apps/api/.env 의 MONITOR_INGEST_TOKEN 과 같은 값 (API 에서 비웠으면 생략)

status: WORKING/RUNNING (작업 중), WAITING (대기), IDLE/DONE (쉬는 중),
        ERROR/FAILED (실패 → 알림), COMPLETE (놓치면 안 되는 완료 → 알림)
"""

import os
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

STATUS_URL = os.environ.get("MONITOR_STATUS_URL", "http://127.0.0.1:8080/monitor/status")
INGEST_TOKEN = os.environ.get("MONITOR_INGEST_TOKEN", "")


def post_status(agent_id: str, status: str, message: str, on_error=print) -> None:
    headers = {"X-Monitor-Token": INGEST_TOKEN} if INGEST_TOKEN else {}
    try:
        requests.post(
            STATUS_URL,
            json={"agentId": agent_id, "status": status, "message": message},
            headers=headers,
            timeout=2,
        )
    except Exception as e:
        on_error(f"[모니터 통신 에러] {e}")

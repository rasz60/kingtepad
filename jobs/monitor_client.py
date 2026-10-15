"""
에이전트 모니터(kingtepad API) 로 배치 작업 상태를 보내는 공용 함수.

설정 (jobs/.env 또는 환경변수):
  MONITOR_STATUS_URL    기본 http://127.0.0.1:8080/monitor/status
  MONITOR_INGEST_TOKEN  apps/api/.env 의 MONITOR_INGEST_TOKEN 과 같은 값 (API 에서 비웠으면 생략)

status: WORKING/RUNNING (작업 중), WAITING (대기), IDLE/DONE (쉬는 중),
        ERROR/FAILED (실패 → 알림), COMPLETE (놓치면 안 되는 완료 → 알림)
name:   픽셀 오피스 캐릭터 라벨에 보일 이름 (생략하면 agent_id). 캐릭터를 처음 만들 때만 반영
label:  쉬는 상태일 때 라벨에 'Idle' 대신 보일 문구 (예: '퇴근했습니다!😁')
"""

from __future__ import annotations

import os
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

STATUS_URL = os.environ.get("MONITOR_STATUS_URL", "http://127.0.0.1:8080/monitor/status")
INGEST_TOKEN = os.environ.get("MONITOR_INGEST_TOKEN", "")


def post_status(agent_id: str, status: str, message: str, on_error=print, name: str | None = None, label: str | None = None) -> bool:
    """보냈으면 True. 한 번만 보내는 상태(장 마감 등)는 False 일 때 다시 보내야 한다 (예: 배포로 API 가 재시작 중)."""
    headers = {"X-Monitor-Token": INGEST_TOKEN} if INGEST_TOKEN else {}
    body = {"agentId": agent_id, "status": status, "message": message}
    if name:
        body["name"] = name
    if label:
        body["label"] = label
    try:
        res = requests.post(
            STATUS_URL,
            json=body,
            headers=headers,
            timeout=2,
        )
        if res.ok:
            return True
        on_error(f"[모니터 응답 에러] {res.status_code}")
    except Exception as e:
        on_error(f"[모니터 통신 에러] {e}")
    return False

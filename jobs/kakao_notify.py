"""
카카오톡 '나에게 보내기' 발송 (카카오 REST API).

준비 (최초 1회, README '카카오톡 알림 준비' 참고):
  1) Kakao Developers 앱 생성 → 카카오 로그인 켜기 → Redirect URI 등록 → 동의항목 '카카오톡 메시지 전송(talk_message)'
  2) jobs/.env 에 KAKAO_REST_API_KEY (클라이언트 시크릿을 켰으면 KAKAO_CLIENT_SECRET 도)
  3) python jobs/kakao_auth.py 로 토큰 발급 → jobs/.kakao_token.json 저장 (절대 커밋 금지)

액세스 토큰이 만료됐거나 401 이 오면 리프레시 토큰으로 갱신하고 1번 다시 보낸다.
갱신 응답에 새 리프레시 토큰이 오면 파일에 덮어쓴다 (카카오는 만료가 가까우면 새로 내려준다).
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Callable

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

KAUTH_TOKEN_URL = "https://kauth.kakao.com/oauth/token"
KAUTH_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize"
MEMO_SEND_URL = "https://kapi.kakao.com/v2/api/talk/memo/default/send"
TOKEN_FILE = Path(os.environ.get("KAKAO_TOKEN_FILE") or Path(__file__).with_name(".kakao_token.json"))
# 텍스트 템플릿은 link 가 필수. 카카오 앱 '플랫폼 > Web 사이트 도메인'에 등록한 도메인이어야 버튼이 열린다
LINK_URL = os.environ.get("KAKAO_LINK_URL", "https://ae2p.duckdns.org/diary/monitor")
TEXT_MAX = 200  # 텍스트 템플릿 본문 최대 길이
EXPIRY_MARGIN = 60  # 만료 60초 전부터는 미리 갱신


class KakaoError(Exception):
    pass


def _client_params() -> dict[str, str]:
    key = os.environ.get("KAKAO_REST_API_KEY", "").strip()
    if not key:
        raise KakaoError("KAKAO_REST_API_KEY 가 비어 있습니다 (jobs/.env)")
    params = {"client_id": key}
    secret = os.environ.get("KAKAO_CLIENT_SECRET", "").strip()
    if secret:
        params["client_secret"] = secret
    return params


def redirect_uri() -> str:
    return os.environ.get("KAKAO_REDIRECT_URI", "http://localhost:8765/kakao").strip()


def load_token(path: Path | None = None) -> dict[str, Any]:
    path = path or TOKEN_FILE
    if not path.exists():
        raise KakaoError(f"토큰 파일이 없습니다: {path.name} (python jobs/kakao_auth.py 로 먼저 발급)")
    return json.loads(path.read_text(encoding="utf-8"))


def save_token(token: dict[str, Any], path: Path | None = None) -> None:
    path = path or TOKEN_FILE
    path.write_text(json.dumps(token, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def _merge_token_response(old: dict[str, Any], res: dict[str, Any], now: float) -> dict[str, Any]:
    """토큰 응답을 저장 형식으로 합친다. 새 리프레시 토큰이 없으면 기존 값을 유지한다."""
    token = dict(old)
    token["access_token"] = res["access_token"]
    token["expires_at"] = now + int(res.get("expires_in", 0))
    if res.get("scope"):
        token["scope"] = res["scope"]
    if res.get("refresh_token"):
        token["refresh_token"] = res["refresh_token"]
        if res.get("refresh_token_expires_in"):
            token["refresh_token_expires_at"] = now + int(res["refresh_token_expires_in"])
    return token


def _post_token(data: dict[str, str]) -> dict[str, Any]:
    res = requests.post(KAUTH_TOKEN_URL, data=data, timeout=10)
    try:
        body = res.json()
    except ValueError:
        body = {"raw": res.text[:200]}
    if not res.ok or "access_token" not in body:
        raise KakaoError(f"토큰 요청 실패 HTTP {res.status_code}: {body.get('error_description') or body}")
    return body


def authorize_url() -> str:
    params = _client_params()
    return (
        f"{KAUTH_AUTHORIZE_URL}?client_id={params['client_id']}"
        f"&redirect_uri={requests.utils.quote(redirect_uri(), safe='')}"
        "&response_type=code&scope=talk_message"
    )


def exchange_code(code: str, path: Path | None = None) -> dict[str, Any]:
    """인가 코드로 최초 토큰을 받아 저장한다 (kakao_auth.py)."""
    data = {"grant_type": "authorization_code", "redirect_uri": redirect_uri(), "code": code, **_client_params()}
    token = _merge_token_response({}, _post_token(data), time.time())
    if not token.get("refresh_token"):
        raise KakaoError("응답에 refresh_token 이 없습니다")
    save_token(token, path)
    return token


def refresh(path: Path | None = None) -> dict[str, Any]:
    old = load_token(path)
    if not old.get("refresh_token"):
        raise KakaoError("저장된 refresh_token 이 없습니다 (kakao_auth.py 로 다시 발급)")
    data = {"grant_type": "refresh_token", "refresh_token": old["refresh_token"], **_client_params()}
    token = _merge_token_response(old, _post_token(data), time.time())
    save_token(token, path)
    return token


def _send(access_token: str, text: str, button: str) -> requests.Response:
    template = {
        "object_type": "text",
        "text": text[:TEXT_MAX],
        "link": {"web_url": LINK_URL, "mobile_web_url": LINK_URL},
        "button_title": button,
    }
    return requests.post(
        MEMO_SEND_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        data={"template_object": json.dumps(template, ensure_ascii=False)},
        timeout=10,
    )


def send_to_me(text: str, button: str = "에이전트 보기", on_error: Callable[[str], Any] = print, path: Path | None = None) -> bool:
    """나에게 보내기. 보냈으면 True. 실패 이유는 on_error 로 넘긴다."""
    try:
        token = load_token(path)
        if not token.get("access_token") or float(token.get("expires_at", 0)) - EXPIRY_MARGIN < time.time():
            token = refresh(path)
        res = _send(token["access_token"], text, button)
        if res.status_code == 401:
            token = refresh(path)
            res = _send(token["access_token"], text, button)
        if res.ok:
            return True
        on_error(f"[카카오 발송 실패] HTTP {res.status_code} {res.text[:200]}")
    except KakaoError as e:
        on_error(f"[카카오 발송 실패] {e}")
    except Exception as e:  # 네트워크 오류 등
        on_error(f"[카카오 통신 에러] {e}")
    return False

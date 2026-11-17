#!/usr/bin/env python3
"""
카카오톡 '나에게 보내기' 토큰 최초 발급 도우미 (1회만 실행).

  ./venv/bin/python3 jobs/kakao_auth.py

1) 출력되는 주소를 브라우저에서 열고 카카오 계정으로 동의한다
2) Redirect URI 로 이동한 주소창의 전체 주소(또는 code= 값)를 붙여 넣는다
   (기본 Redirect URI 가 http://localhost:8765/kakao 라 '연결할 수 없음' 화면이 떠도 정상이다)
3) jobs/.kakao_token.json 이 만들어지면 끝. 이후 갱신은 kakao_notify.py 가 자동으로 한다
"""

from __future__ import annotations

import sys
from urllib.parse import parse_qs, urlparse

from kakao_notify import KakaoError, TOKEN_FILE, authorize_url, exchange_code


def parse_code(text: str) -> str:
    text = text.strip()
    if "code=" in text:
        return parse_qs(urlparse(text).query).get("code", [""])[0] or text.split("code=", 1)[1].split("&", 1)[0]
    return text


def main() -> int:
    try:
        print("아래 주소를 브라우저에서 열어 동의하세요:\n")
        print(authorize_url())
        code = parse_code(input("\n이동한 주소 또는 code 값을 붙여 넣으세요: "))
        if not code:
            print("code 가 비어 있습니다.")
            return 1
        token = exchange_code(code)
    except KakaoError as e:
        print(f"실패: {e}")
        return 1
    print(f"\n저장 완료: {TOKEN_FILE} (scope: {token.get('scope', '-')})")
    print("테스트: bash scripts/ktx-watch.sh test-notify")
    return 0


if __name__ == "__main__":
    sys.exit(main())

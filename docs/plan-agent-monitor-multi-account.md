# 계획: 에이전트 모니터 계정별 분리 (1 + C)

> 상태: **계획만** (2026-10-15 결정, 구현 전)

## 목표

- 계정을 추가해도 **상태 로그와 알림(🔔·웹 푸시)은 그 계정이 등록한 잡의 것만** 보인다.
- **픽셀 오피스는 공용**으로 둔다(C안). 다른 계정의 캐릭터와 말풍선은 보일 수 있다.
  - 계정마다 pixel-agents를 따로 띄우는 A안은 메모리(개당 약 80MB) 때문에 보류한다.

## 지금 구조 (바꿀 부분)

| 위치 | 지금 | 문제 |
|---|---|---|
| `apps/api/src/monitor/index.ts` | 토큰 하나(`MONITOR_INGEST_TOKEN`)로 상태를 받는다. `recent`, `agents`를 메모리에 하나만 두고 모든 WebSocket에 broadcast | 누가 보낸 상태인지 모름 |
| `apps/api/src/notifier.ts` `notifyOwners` | `auth.admin.listUsers()`로 **모든 계정**에 알림을 넣는다 | 다른 계정도 내 잡 알림을 받음 |
| `jobs/monitor_client.py` | `X-Monitor-Token` 헤더에 공용 토큰을 넣는다 | 계정 구분 없음 |

## 설계

### 1. 잡 토큰 (계정별)
- Supabase 마이그레이션: `monitor_tokens` 테이블
  - `id`, `user_id`(auth.users), `name`(예: "Oracle 서버"), `token_hash`(sha256), `created_at`, `last_used_at`
  - RLS: 본인 행만 select/insert/delete. 토큰 원문은 저장하지 않는다.
- 설정.ini에 `[잡 토큰]` 섹션을 둔다. "발급" 버튼을 누르면 원문을 **한 번만** 보여 주고, 목록에서 삭제할 수 있다.
  - 발급은 API(`POST /monitor/tokens`)가 맡는다. 랜덤 생성과 해시 저장을 서버에서 하기 위해서다.
- 기존 `MONITOR_INGEST_TOKEN`과 로컬(127.0.0.1) 허용은 **관리자 계정(env `MONITOR_OWNER_USER_ID`)의 것으로 취급**한다. 지금 돌고 있는 잡을 고치지 않아도 되게 하기 위해서다.

### 2. 상태 수신 (`POST /monitor/status`)
- 토큰 → `user_id`를 조회한다. 메모리에 1분간 캐시해서 매 요청마다 DB를 부르지 않게 한다.
- `AgentStatus`에 `userId`를 붙인다.
- `recent`는 사용자별 Map(`userId → AgentStatus[]`, 각 50개)으로 바꾼다.
- **pixel-agents 세션 ID가 겹치지 않게** 한다. 같은 이름의 잡을 두 계정이 보낼 수 있으므로 `session_id`를 `${userId 앞 8자}:${agentId}`로 만든다. 오피스 말풍선의 이름은 agentId 그대로 둔다.

### 3. 실시간 로그 (`GET /monitor/ws`)
- 연결할 때 세션 쿠키의 `userId`를 소켓에 기록한다(`clients: Map<WebSocket, userId>`).
- snapshot과 agentUpdate는 **같은 userId 소켓에만** 보낸다.
- `pixelAgentsReady`는 공용 이벤트라 모두에게 보낸다.

### 4. 알림
- `notifyOwners` → `notifyUser(userId, draft)`로 바꾼다. 상태를 보낸 계정에만 넣는다.

### 5. 잡 쪽
- `jobs/.env`의 `MONITOR_INGEST_TOKEN`에 **계정별 토큰**을 넣는다. 코드 변경은 없다(헤더 이름이 같음).
- 외부 PC에서 도는 잡은 `MONITOR_STATUS_URL=https://kingtepad.duckdns.org/api/monitor/status`로 보낸다.

## 작업 순서 (예상 반나절)
1. 마이그레이션 `monitor_tokens` + RLS
2. API: 토큰 발급/삭제 라우트, `canIngest` → `resolveIngestUser`, 사용자별 recent/broadcast, `notifyUser`
3. 웹: 설정.ini `[잡 토큰]` 섹션
4. 테스트: 두 계정으로 각각 상태를 보내 로그와 알림이 섞이지 않는지, 오피스에는 둘 다 보이는지 확인
5. README 에이전트 모니터 절 갱신

## 열어 둔 질문
- 다른 계정의 잡도 **이 서버의 pm2**에서 돌릴지(그러면 jobs 폴더를 계정별로 나눠야 함), 각자 외부에서 돌릴지
- 회원가입을 열지, 관리자가 Supabase에서 직접 계정을 만들지(지금은 이메일+비밀번호 로그인만 있음)

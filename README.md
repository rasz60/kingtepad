# 업무 일지

개인용 업무 일지 웹 + PWA. 업무(Task)와 날짜별 일지(WorkLog)를 분리해서 진척 이력과 실제 투입 공수를 기록한다.

```
apps/web         React + Vite PWA   — CRUD는 Supabase 직접 호출 (RLS)
apps/api         Fastify (Oracle Cloud) — 보고서·알림·에이전트 모니터 등 서버 작업
packages/shared  상태/진척/영업일/빠른입력/보고서 로직 (web·api 공용)
jobs/            배치 작업 (Python, pm2) — 주식 시세·나라장터 감시 → 에이전트 모니터로 상태 전송
supabase/        DB 마이그레이션
```

## 1. Supabase 준비

1. 프로젝트 생성 후 **SQL Editor**에서 `supabase/migrations/` 의 SQL을 파일명 순서대로 실행 (`init` → `events` → `alarms` → `agent_notifications`)
2. **Authentication → Users → Add user**로 본인 계정 생성 (기본 카테고리 11개 자동 생성)
3. **Authentication → Sign In / Providers → Allow new users to sign up 끄기** (1인용)
4. **Settings → API**에서 URL과 `anon` 키 복사

> 공휴일은 2026~2027년이 들어가 있다. 매년 `holidays` 테이블에 추가할 것.

## 2. 로컬 실행

```bash
npm install
cp apps/web/.env.example apps/web/.env   # Supabase URL/anon key 입력
cp apps/api/.env.example apps/api/.env
npm run dev:web    # http://localhost:5173 (같은 와이파이의 폰에서도 접속 가능)
npm run dev:api    # http://localhost:8080/health
npm test           # 도메인 로직 테스트
```

## 3. Oracle Cloud 배포 (DuckDNS + Caddy + pm2)

PWA 설치·웹 푸시는 HTTPS 에서만 동작하므로 DuckDNS 도메인 + Caddy(인증서 자동 발급)를 쓴다. 아래 예시의 도메인은 `kingtepad.duckdns.org`.

```
https://kingtepad.duckdns.org        Caddy ─┬─ /api/*  → 127.0.0.1:8080  Fastify API (+ /api/monitor/ws WebSocket)
                                            └─ 그 외   → apps/web/dist    정적 파일 (SPA)
https://kingtepad.duckdns.org:8443   Caddy ─── 127.0.0.1:8081  픽셀 오피스 프록시 → pixel-agents (127.0.0.1:랜덤)
jobs/*.py (pm2) ──POST http://127.0.0.1:8080/monitor/status
```

1. **DuckDNS**: duckdns.org 에서 서브도메인을 만들고 서버 공인 IP 를 넣는다 (Oracle 예약 IP 면 갱신 cron 불필요)
2. **포트 열기**: Oracle Security List(또는 NSG)와 OS 방화벽에서 TCP `80`, `443`, `8443`. 기존 모니터의 `5000`, `5001` 은 닫는다
   ```bash
   # Oracle Ubuntu 이미지는 iptables 기본 차단
   for p in 80 443 8443; do sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport $p -j ACCEPT; done
   sudo netfilter-persistent save
   ```
3. **환경 변수**
   - `apps/api/.env`: `HOST=127.0.0.1`, `CORS_ORIGIN=https://kingtepad.duckdns.org`, Supabase·VAPID 키, `MONITOR_INGEST_TOKEN`(임의의 긴 문자열)
   - `apps/web/.env`: `VITE_API_URL=https://kingtepad.duckdns.org/api`, `VITE_MONITOR_OFFICE_URL=https://kingtepad.duckdns.org:8443`
   - `jobs/.env`: `jobs/.env.example` 참고 (`MONITOR_INGEST_TOKEN` 은 API 와 같은 값, KIS 키)
4. **빌드 · 실행**
   ```bash
   npm ci && npm run build
   python3 -m venv venv && ./venv/bin/pip install -r jobs/requirements.txt
   pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
   ```
   업데이트: `git pull && npm ci && npm run build && pm2 startOrReload ecosystem.config.cjs`
5. **Caddy**: `/etc/caddy/Caddyfile` 작성 후 `sudo systemctl reload caddy` (Caddy 사용자가 `apps/web/dist` 를 읽을 수 있어야 한다)
   ```
   kingtepad.duckdns.org {
     encode gzip
     handle_path /api/* {
       reverse_proxy 127.0.0.1:8080
     }
     handle {
       root * /home/ubuntu/kingtepad/apps/web/dist
       try_files {path} /index.html
       file_server
     }
   }

   kingtepad.duckdns.org:8443 {
     reverse_proxy 127.0.0.1:8081
   }
   ```

### 에이전트 모니터 (구 pixel-agent-monitor)

배치 작업 상태를 **에이전트.exe** 탭에 픽셀 오피스(pixel-agents 캐릭터)와 실시간 로그로 보여준다. 로그인은 업무일지 계정 하나로 끝난다.

- API 가 시작될 때 `npx pixel-agents` 를 자식 프로세스로 띄운다 (첫 실행은 다운로드로 1분 정도). `MONITOR_PIXEL_AGENTS=0` 이면 끈다
- 탭을 열면 웹이 Supabase 토큰으로 `POST /monitor/session` 을 불러 세션 쿠키를 받고, 그 쿠키로 WebSocket 로그와 픽셀 오피스(`:8443`)가 열린다
- `ERROR` · `FAILED` · `COMPLETE` 상태는 🔔 알림함에 `에이전트` 알림으로 저장되고 웹 푸시로도 간다 (`SUPABASE_SERVICE_ROLE_KEY` 필요)
- 상태 보내기: `POST /monitor/status` `{ "agentId": "worker1", "status": "WORKING", "message": "..." }`
  - `WORKING`/`RUNNING`/`ACTIVE` 작업 중 · `WAITING`/`PENDING`/`QUEUED` 대기 · `ERROR`/`FAILED` 실패 · `COMPLETE`/`DONE`/`IDLE` 등 쉬는 중
  - `MONITOR_INGEST_TOKEN` 을 설정했으면 `X-Monitor-Token` 헤더 필수. 비웠으면 같은 서버(127.0.0.1)에서 직접 보낸 요청만 받는다
- 배치 작업: `jobs/run_stocks.py`(KIS 시세, 종목은 `jobs/stocks.json`), `jobs/watch_openg.py`(나라장터 개찰결과, 결과가 뜨면 `COMPLETE` 후 종료)
- 로컬 개발: `npm run dev:api` 후 `apps/web/.env` 에 `VITE_API_URL=http://localhost:8080` (오피스는 `http://localhost:8081`)

### 알림 · 웹 푸시

1. `npx web-push generate-vapid-keys`로 키 쌍 생성
2. `apps/api/.env`: `SUPABASE_SERVICE_ROLE_KEY`(Supabase Settings → API), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
3. `apps/web/.env`: `VITE_VAPID_PUBLIC_KEY`(위 공개키와 같은 값) 후 웹 다시 빌드
4. 앱의 **설정.ini → [알림]** 또는 🔔 패널에서 기기마다 `푸시 받기`
   - 아이폰은 Safari 공유 → **홈 화면에 추가**로 설치한 앱에서만 푸시 가능 (iOS 16.4+)
   - 푸시는 서비스 워커가 있는 빌드(HTTPS)에서만 동작한다. `npm run dev:web`에서는 비활성

> API 스케줄러가 없어도 웹을 열면 알림이 생성·표시된다. 앱이 닫혀 있을 때의 배너·아이콘 숫자는 스케줄러가 있어야 한다.

## 주요 개념

| 항목 | 규칙 |
|---|---|
| 상태 | 저장하지 않고 계산: 삭제 > 완료(100%) > 예정(시작 전) > 지연(실제 < 예상) > 진행 |
| 예상 진척 | 예정 기간 중 **영업일**(주말·공휴일 제외) 경과 비율 |
| 공수 | 일지의 투입 시간 합계. 8시간 = 1MD, 20MD = 1MM |
| 업무 진척 | 가장 최근 일지의 진척률이 DB 트리거로 반영되고, 실제 시작/종료일도 일지 날짜로 자동 기록 |
| 삭제 | 휴지통(soft delete) → 복원 또는 영구 삭제 |
| 빠른 입력 | `#카테고리 내용 1h30m 60%`. 업무를 고르지 않고 `#카테고리`를 쓰면 당일 업무를 만들고 일지까지 기록 |
| 알림 | 일정·업무 알람(시작 n분/시간/일 전, 시간 없으면 09:00 기준) + 매일 09시 지연 업무·내일 마감 업무. 웹은 🔔 패널과 토스트, 모바일은 웹 푸시 배너와 앱 아이콘 숫자 |
| 캘린더 | 업무 예정 기간 + 일정(개인/업무, 종일 또는 시간 지정) + 날짜별 일지 투입 시간. 월/주/일 보기(일요일 시작), 업무 예정·개인·업무 일정 필터 |

## 로드맵

- [x] **1단계 MVP**: 로그인, 업무 CRUD와 휴지통, 업무별 일지, 오늘 화면, 빠른 입력, 필터·검색, 주간 보고서(복사/.md), 카테고리 관리, PWA, 반응형, 다크 모드
- [ ] **2단계**: ~~캘린더(월/주/일) + 일정 등록~~ ✅, 칸반 보드, 간트 타임라인, 월간 통계, 진척 이력 그래프
- [ ] **3단계**: ~~Web Push 알림(알람·지연·마감 임박)~~ ✅, 퇴근 전 일지 리마인더, 오프라인 작성 후 동기화, 엑셀/PDF 내보내기
- [ ] **4단계**: AI 주간보고 요약, 첨부파일(Supabase Storage), 반복 업무, 템플릿

# 업무 일지

개인용 업무 일지 웹 + PWA. 업무(Task)와 날짜별 일지(WorkLog)를 분리해서 진척 이력과 실제 투입 공수를 기록한다.

```
apps/web         React + Vite PWA   — CRUD는 Supabase 직접 호출 (RLS)
apps/api         Fastify (Oracle Cloud) — 보고서·알림·AI 등 서버 작업
packages/shared  상태/진척/영업일/빠른입력/보고서 로직 (web·api 공용)
supabase/        DB 마이그레이션
```

## 1. Supabase 준비

1. 프로젝트 생성 후 **SQL Editor**에서 `supabase/migrations/20261013000000_init.sql` 실행
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

## 3. Oracle Cloud 배포

- **HTTPS 필수**: PWA 홈 화면 설치는 HTTPS에서만 동작한다. 도메인을 연결하고 Caddy를 쓰면 인증서가 자동 발급된다.
- 웹: `npm run build -w @kingtepad/web` → `apps/web/dist`를 정적 서빙 (SPA라 모든 경로를 `index.html`로 fallback)
- API: `npm run build -w @kingtepad/api` → `node --env-file=.env apps/api/dist/index.js` (systemd 또는 pm2)
- 보안 목록(Security List)과 OS 방화벽에서 443 포트를 열 것

Caddyfile 예시:

```
diary.example.com {
  handle_path /api/* {
    reverse_proxy localhost:8080
  }
  handle {
    root * /srv/kingtepad/web
    try_files {path} /index.html
    file_server
  }
}
```

## 주요 개념

| 항목 | 규칙 |
|---|---|
| 상태 | 저장하지 않고 계산: 삭제 > 완료(100%) > 예정(시작 전) > 지연(실제 < 예상) > 진행 |
| 예상 진척 | 예정 기간 중 **영업일**(주말·공휴일 제외) 경과 비율 |
| 공수 | 일지의 투입 시간 합계. 8시간 = 1MD, 20MD = 1MM |
| 업무 진척 | 가장 최근 일지의 진척률이 DB 트리거로 반영되고, 실제 시작/종료일도 일지 날짜로 자동 기록 |
| 삭제 | 휴지통(soft delete) → 복원 또는 영구 삭제 |
| 빠른 입력 | `#카테고리 내용 1h30m 60%`. 업무를 고르지 않고 `#카테고리`를 쓰면 당일 업무를 만들고 일지까지 기록 |

## 로드맵

- [x] **1단계 MVP**: 로그인, 업무 CRUD와 휴지통, 업무별 일지, 오늘 화면, 빠른 입력, 필터·검색, 주간 보고서(복사/.md), 카테고리 관리, PWA, 반응형, 다크 모드
- [ ] **2단계**: 칸반 보드, 캘린더/간트 타임라인, 월간 통계, 진척 이력 그래프
- [ ] **3단계**: Web Push 알림(퇴근 전 일지 리마인더, 마감 임박), 오프라인 작성 후 동기화, 엑셀/PDF 내보내기
- [ ] **4단계**: AI 주간보고 요약, 첨부파일(Supabase Storage), 반복 업무, 템플릿

-- 업무 일지 초기 스키마
-- 업무(tasks) 1 : N 일지(work_logs) 구조. 모든 테이블은 RLS로 본인 데이터만 접근 가능.

-- ─────────────────────────────────────────────
-- 카테고리
-- ─────────────────────────────────────────────
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  color       text not null default '#64748b',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- ─────────────────────────────────────────────
-- 업무
--   status는 저장하지 않고 progress + 기간 + deleted_at 으로 계산 (packages/shared/src/status.ts)
-- ─────────────────────────────────────────────
create table public.tasks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id    uuid references public.categories (id) on delete set null,
  title          text not null check (length(title) between 1 and 200),
  description    text not null default '',          -- markdown
  planned_start  date not null,
  planned_end    date not null,
  actual_start   date,
  actual_end     date,
  progress       int  not null default 0 check (progress between 0 and 100),
  tags           text[] not null default '{}',
  deleted_at     timestamptz,                         -- soft delete (휴지통)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (planned_start <= planned_end),
  check (actual_start is null or actual_end is null or actual_start <= actual_end)
);

create index tasks_user_period_idx on public.tasks (user_id, planned_start, planned_end) where deleted_at is null;
create index tasks_tags_idx on public.tasks using gin (tags);

-- ─────────────────────────────────────────────
-- 일지 (하루 단위 작업 기록)
--   task_id 가 null 이면 특정 업무에 속하지 않는 일반 메모성 일지
-- ─────────────────────────────────────────────
create table public.work_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id     uuid references public.tasks (id) on delete cascade,
  log_date    date not null default (now() at time zone 'Asia/Seoul')::date,
  content     text not null default '',              -- markdown
  minutes     int  not null default 0 check (minutes between 0 and 1440),
  progress    int  check (progress between 0 and 100), -- 이 일지 시점의 진척률 스냅샷
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index work_logs_user_date_idx on public.work_logs (user_id, log_date desc);
create index work_logs_task_idx on public.work_logs (task_id, log_date desc);

-- 본문 전문 검색 (제목 + 내용)
create index tasks_search_idx on public.tasks
  using gin (to_tsvector('simple', title || ' ' || description));
create index work_logs_search_idx on public.work_logs
  using gin (to_tsvector('simple', content));

-- ─────────────────────────────────────────────
-- 공휴일 (영업일 계산용, 전체 공용 · 읽기 전용)
-- ─────────────────────────────────────────────
create table public.holidays (
  date  date primary key,
  name  text not null
);

-- ─────────────────────────────────────────────
-- updated_at 자동 갱신
-- ─────────────────────────────────────────────
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();
create trigger work_logs_touch before update on public.work_logs
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────
-- 일지 변경 시 업무에 반영 (일지 집계로 재계산)
--   - 가장 최근 일지의 progress 를 업무 progress 로
--   - 실제 시작일 = 첫 일지 날짜
--   - progress 100 이면 실제 종료일 = 마지막 일지 날짜
-- ─────────────────────────────────────────────
create function public.recalc_task(p_task_id uuid) returns void
language plpgsql security invoker as $$
declare
  latest_progress int;
  first_date date;
  last_date date;
begin
  select progress into latest_progress
    from public.work_logs
   where task_id = p_task_id and progress is not null
   order by log_date desc, created_at desc
   limit 1;

  select min(log_date), max(log_date) into first_date, last_date
    from public.work_logs
   where task_id = p_task_id;

  update public.tasks t
     set progress     = coalesce(latest_progress, t.progress),
         actual_start = first_date,
         actual_end   = case when coalesce(latest_progress, t.progress) = 100 then last_date end
   where t.id = p_task_id;
end $$;

create function public.sync_task_from_log() returns trigger
language plpgsql security invoker as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.task_id is not null then
    perform public.recalc_task(new.task_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.task_id is not null
     and (tg_op = 'DELETE' or old.task_id is distinct from new.task_id) then
    perform public.recalc_task(old.task_id);
  end if;
  return null;
end $$;

create trigger work_logs_sync after insert or update or delete on public.work_logs
  for each row execute function public.sync_task_from_log();

-- ─────────────────────────────────────────────
-- 신규 사용자 기본 카테고리
-- ─────────────────────────────────────────────
create function public.seed_default_categories() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.categories (user_id, name, color, sort_order) values
    (new.id, '개발',     '#3b82f6', 1),
    (new.id, '장애조치', '#ef4444', 2),
    (new.id, '점검',     '#14b8a6', 3),
    (new.id, '환경설정', '#8b5cf6', 4),
    (new.id, '문의',     '#f59e0b', 5),
    (new.id, '회의',     '#64748b', 6),
    (new.id, '교육',     '#22c55e', 7),
    (new.id, '보고',     '#0ea5e9', 8),
    (new.id, '인수인계', '#a855f7', 9),
    (new.id, '출장',     '#f97316', 10),
    (new.id, '기타',     '#94a3b8', 11);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.seed_default_categories();

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
alter table public.categories enable row level security;
alter table public.tasks      enable row level security;
alter table public.work_logs  enable row level security;
alter table public.holidays   enable row level security;

create policy "own categories" on public.categories
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own tasks" on public.tasks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own work_logs" on public.work_logs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "read holidays" on public.holidays
  for select to authenticated using (true);

-- 2026~2027 공휴일 (대체공휴일 포함, 필요 시 추가)
insert into public.holidays (date, name) values
  ('2026-01-01', '신정'),
  ('2026-02-16', '설날 연휴'), ('2026-02-17', '설날'), ('2026-02-18', '설날 연휴'),
  ('2026-03-01', '삼일절'), ('2026-03-02', '삼일절 대체공휴일'),
  ('2026-05-05', '어린이날'), ('2026-05-24', '부처님오신날'), ('2026-05-25', '부처님오신날 대체공휴일'),
  ('2026-06-03', '전국동시지방선거'),
  ('2026-06-06', '현충일'),
  ('2026-08-15', '광복절'), ('2026-08-17', '광복절 대체공휴일'),
  ('2026-09-24', '추석 연휴'), ('2026-09-25', '추석'), ('2026-09-26', '추석 연휴'),
  ('2026-10-03', '개천절'), ('2026-10-05', '개천절 대체공휴일'),
  ('2026-10-09', '한글날'),
  ('2026-12-25', '성탄절'),
  ('2027-01-01', '신정'),
  ('2027-02-06', '설날 연휴'), ('2027-02-07', '설날'), ('2027-02-08', '설날 연휴'), ('2027-02-09', '설날 대체공휴일'),
  ('2027-03-01', '삼일절'),
  ('2027-05-05', '어린이날'), ('2027-05-13', '부처님오신날'),
  ('2027-06-06', '현충일'),
  ('2027-08-15', '광복절'), ('2027-08-16', '광복절 대체공휴일'),
  ('2027-09-14', '추석 연휴'), ('2027-09-15', '추석'), ('2027-09-16', '추석 연휴'),
  ('2027-10-03', '개천절'), ('2027-10-04', '개천절 대체공휴일'),
  ('2027-10-09', '한글날'), ('2027-10-11', '한글날 대체공휴일'),
  ('2027-12-25', '성탄절'), ('2027-12-27', '성탄절 대체공휴일');

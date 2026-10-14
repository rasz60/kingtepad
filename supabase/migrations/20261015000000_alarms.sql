-- 알람 · 알림함 · 웹 푸시 구독
--   알람은 "시작 n분 전" 목록으로 저장한다. 일정은 시작 시각(종일이면 09:00), 업무는 시작예정일 09:00 기준.
--   알림 생성 규칙은 packages/shared/src/alarms.ts (웹·API 공용). dedupe_key 로 같은 알림은 한 번만 저장된다.

alter table public.events add column alarms int[] not null default '{}';
alter table public.tasks  add column alarms int[] not null default '{}';

-- ─────────────────────────────────────────────
-- 알림함
-- ─────────────────────────────────────────────
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('alarm', 'delayed', 'due_soon')),
  title       text not null,
  body        text not null default '',
  link        text not null default '/',
  dedupe_key  text not null,
  fire_at     timestamptz not null default now(),
  read_at     timestamptz,
  pushed_at   timestamptz,            -- 웹 푸시 발송(시도) 시각. API 스케줄러가 기록
  created_at  timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index notifications_user_idx on public.notifications (user_id, fire_at desc);
create index notifications_unpushed_idx on public.notifications (created_at) where pushed_at is null;

-- ─────────────────────────────────────────────
-- 웹 푸시 구독 (기기별)
-- ─────────────────────────────────────────────
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text not null default '',
  created_at  timestamptz not null default now()
);

alter table public.notifications      enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "own notifications" on public.notifications
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own push_subscriptions" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

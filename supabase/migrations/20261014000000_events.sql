-- 캘린더 일정
--   업무(tasks)와 별개로 개인 일정·업무 일정(회의, 출장 등)을 기록한다.
--   start_time 이 null 이면 종일 일정. 업무 일정은 특정 업무에 연결할 수 있다.

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null default 'personal' check (kind in ('personal', 'work')),
  title       text not null check (length(title) between 1 and 200),
  start_date  date not null,
  end_date    date not null,
  start_time  time,
  end_time    time,
  task_id     uuid references public.tasks (id) on delete set null,
  memo        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (start_date <= end_date),
  check (start_time is not null or end_time is null)
);

create index events_user_period_idx on public.events (user_id, start_date, end_date);

create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

alter table public.events enable row level security;

create policy "own events" on public.events
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

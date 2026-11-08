-- P-0004 테스터 계정: 기본 데이터 잠금 · 테스터가 새로 만든 데이터 정리 (업무일지 public 스키마)
--
-- 실행: Supabase SQL Editor 에서 이 파일 전체를 실행한다. 다시 실행해도 된다.
-- 먼저 Database → Extensions 에서 pg_cron 을 켠다 (매일 새벽 정리).
--
-- 테스터 상태는 auth.users.raw_app_meta_data 에 있다. 포털 계정 관리가 바꾸고, 사용자는 바꿀 수 없다.
--   role = 'tester'             테스터 계정 (로그인 화면의 '테스터로 입장하기')
--   tester_editing = true       관리자가 기본 데이터를 넣는 중 → 잠금 · 정리가 모두 꺼진다
--   tester_baseline_at = 시각    마지막 '잠그기' 시각. 이 시각까지 만든 행 = 기본 데이터(잠금),
--                               이후에 만든 행 = 테스터 데이터(로그아웃 · 매일 정리 때 지운다)
--
-- 브라우저가 이 스키마를 직접 읽고 쓰므로(RLS) 앱 코드가 아니라 트리거로 막는다.
-- 오류 코드: AE401 = 기본 데이터를 바꾸려 함, AE402 = 테스터에게 막은 기능

begin;

-- ─────────────────────────────────────────────
-- 테스터 상태 읽기
-- ─────────────────────────────────────────────

-- 테스터이고 편집 중이 아니면 true (잠금 · 정리가 켜진 상태)
create or replace function public.tester_active(owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select u.raw_app_meta_data ->> 'role' = 'tester'
       and coalesce(u.raw_app_meta_data -> 'tester_editing', 'false'::jsonb) <> 'true'::jsonb
      from auth.users u
     where u.id = owner
  ), false)
$$;

-- 기본 데이터 기준 시각. 한 번도 잠그지 않았으면 -infinity (기본 데이터 없음)
create or replace function public.tester_baseline(owner uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (u.raw_app_meta_data ->> 'tester_baseline_at')::timestamptz
      from auth.users u
     where u.id = owner
  ), '-infinity'::timestamptz)
$$;

-- 테스터가 바꿀 수 없는 기본 데이터인지
create or replace function public.tester_locked(owner uuid, created timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.tester_active(owner) and created is not null and created <= public.tester_baseline(owner)
$$;

-- ─────────────────────────────────────────────
-- 잠금 트리거
--   tg_argv[0] = 주인 열 (user_id)
--   tg_argv[1] = 부모 테이블. 있으면 주인 열은 부모 id 를 가리키고, 부모의 주인 · 만든 시각을 따른다
--   tg_argv[2] = 'block' 이면 테스터의 이 쓰기를 항상 막는다
-- ─────────────────────────────────────────────
create or replace function public.tester_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  r jsonb;
  owner uuid;
  parent_created timestamptz;
  created timestamptz;
begin
  -- 정리 함수가 지우는 중이거나, 서버(service_role: 알림 스케줄러)가 쓰는 것은 그대로 둔다
  if current_setting('ae.tester_reset', true) = 'on' or current_user = 'service_role' then
    return coalesce(new, old);
  end if;
  -- 다른 트리거 안에서 일어난 지우기는 판정하지 않는다
  --   계정을 지우면 데이터가 연쇄로 지워진다 (기본 행이 새 행에 딸리는 일은 없다)
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  if tg_op = 'INSERT' then r := to_jsonb(new); else r := to_jsonb(old); end if;
  if tg_nargs >= 2 and tg_argv[1] <> '' then
    execute format('select user_id, created_at from %s where id = $1', tg_argv[1]::regclass)
       into owner, parent_created
      using (r ->> tg_argv[0])::uuid;
  else
    owner := (r ->> tg_argv[0])::uuid;
  end if;
  if owner is null or not public.tester_active(owner) then
    return coalesce(new, old);
  end if;

  if tg_nargs >= 3 and tg_argv[2] = 'block' then
    raise exception using errcode = 'AE402', message = '테스터 계정에서는 쓸 수 없는 기능이에요';
  end if;

  -- 새 행은 만든 시각을 지금으로 고정한다 (과거 시각을 넣어 기본 데이터처럼 만드는 것을 막는다)
  if tg_op = 'INSERT' then
    if r ? 'created_at' then
      new := jsonb_populate_record(new, jsonb_build_object('created_at', now()));
    end if;
    return new;
  end if;

  created := coalesce((r ->> 'created_at')::timestamptz, parent_created);
  -- 다른 트리거가 고치는 것은 막지 않되, 기본 행이면 원래 값을 그대로 둔다
  --   테스터가 기본 업무에 일지를 쓰면 진척률 · 실제 기간 재계산이 업무를 고치려 하는데, 기본 업무는 그대로 남긴다
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    if created is not null and created <= public.tester_baseline(owner) then
      return old;
    end if;
    return new;
  end if;
  if created is not null and created <= public.tester_baseline(owner) then
    raise exception using errcode = 'AE401', message = '기본 데이터는 테스터가 바꿀 수 없어요';
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) ->> 'created_at') is distinct from (r ->> 'created_at') then
    raise exception using errcode = 'AE401', message = '만든 시각은 바꿀 수 없어요';
  end if;
  return coalesce(new, old);
end $$;

-- 사용자 데이터: 잠금 + 만든 시각 고정
drop trigger if exists tester_guard on public.categories;
create trigger tester_guard before insert or update or delete on public.categories
  for each row execute function public.tester_guard('user_id');
drop trigger if exists tester_guard on public.tasks;
create trigger tester_guard before insert or update or delete on public.tasks
  for each row execute function public.tester_guard('user_id');
drop trigger if exists tester_guard on public.work_logs;
create trigger tester_guard before insert or update or delete on public.work_logs
  for each row execute function public.tester_guard('user_id');
drop trigger if exists tester_guard on public.events;
create trigger tester_guard before insert or update or delete on public.events
  for each row execute function public.tester_guard('user_id');

-- 알림 · 푸시 구독: 기본 데이터가 아니므로 잠그지 않고(읽음 표시는 된다) 만든 시각만 고정한다. 정리 때 지운다
drop trigger if exists tester_guard on public.notifications;
create trigger tester_guard before insert on public.notifications
  for each row execute function public.tester_guard('user_id');
drop trigger if exists tester_guard on public.push_subscriptions;
create trigger tester_guard before insert on public.push_subscriptions
  for each row execute function public.tester_guard('user_id');

-- ─────────────────────────────────────────────
-- 정리: 기준 시각 이후에 만든 테스터 데이터를 지운다. 지운 행 수를 돌려준다
-- ─────────────────────────────────────────────
create or replace function public.tester_reset(uid uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  b timestamptz;
  e timestamptz;
  n integer := 0;
  c integer;
  is_tester boolean;
  editing boolean;
  started timestamptz;
begin
  -- 사용자 토큰으로 부르면 자기 것만. 매일 정리(pg_cron)는 토큰이 없어 auth.uid() 가 비어 있다
  if auth.uid() is not null and auth.uid() <> uid then
    raise exception using errcode = '42501', message = '자기 데이터만 정리할 수 있어요';
  end if;
  select u.raw_app_meta_data ->> 'role' = 'tester',
         coalesce(u.raw_app_meta_data -> 'tester_editing', 'false'::jsonb) = 'true'::jsonb,
         (u.raw_app_meta_data ->> 'tester_edit_started_at')::timestamptz
    into is_tester, editing, started
    from auth.users u where u.id = uid;
  if not coalesce(is_tester, false) then
    return 0;
  end if;
  b := public.tester_baseline(uid);
  -- 편집 중: 편집을 시작하기 전에 남은 방문자 데이터만 지운다 (관리자가 넣는 중인 기본 데이터는 남긴다)
  e := case when editing then coalesce(started, '-infinity'::timestamptz) else 'infinity'::timestamptz end;

  perform set_config('ae.tester_reset', 'on', true);
  delete from public.work_logs where user_id = uid and created_at > b and created_at < e;
  get diagnostics c = row_count; n := n + c;
  delete from public.events where user_id = uid and created_at > b and created_at < e;
  get diagnostics c = row_count; n := n + c;
  delete from public.tasks where user_id = uid and created_at > b and created_at < e;
  get diagnostics c = row_count; n := n + c;
  delete from public.categories where user_id = uid and created_at > b and created_at < e;
  get diagnostics c = row_count; n := n + c;
  delete from public.notifications where user_id = uid and created_at > b and created_at < e;
  get diagnostics c = row_count; n := n + c;
  delete from public.push_subscriptions where user_id = uid and created_at > b and created_at < e;
  get diagnostics c = row_count; n := n + c;
  perform set_config('ae.tester_reset', 'off', true);
  return n;
end $$;

-- 테스터 계정 모두 정리 (매일 새벽)
create or replace function public.tester_reset_all() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  n integer := 0;
begin
  for uid in select u.id from auth.users u where u.raw_app_meta_data ->> 'role' = 'tester' loop
    n := n + public.tester_reset(uid);
  end loop;
  return n;
end $$;

-- 권한: 브라우저(anon)는 못 부른다. 로그인한 사용자는 트리거 판정 · 자기 정리만, 전체 정리는 서버만
revoke all on function public.tester_active(uuid), public.tester_baseline(uuid), public.tester_locked(uuid, timestamptz),
  public.tester_reset(uuid), public.tester_reset_all() from public, anon, authenticated;
grant execute on function public.tester_active(uuid), public.tester_baseline(uuid), public.tester_locked(uuid, timestamptz),
  public.tester_reset(uuid) to authenticated, service_role;
grant execute on function public.tester_reset_all() to service_role;

commit;

-- ─────────────────────────────────────────────
-- 매일 04:00(한국) 정리 = 19:00 UTC. 같은 이름으로 다시 등록하면 덮어쓴다
-- ─────────────────────────────────────────────
create extension if not exists pg_cron;
select cron.schedule('diary-tester-reset', '0 19 * * *', 'select public.tester_reset_all()');

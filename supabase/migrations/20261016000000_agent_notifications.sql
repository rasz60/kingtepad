-- 에이전트 모니터(배치 작업) 알림
--   API 가 POST /monitor/status 로 ERROR·FAILED·COMPLETE 상태를 받으면 kind = 'agent' 알림을 만든다.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check check (kind in ('alarm', 'delayed', 'due_soon', 'agent'));

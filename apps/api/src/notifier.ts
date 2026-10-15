// 알림 스케줄러: 1분마다 알림을 만들고(웹과 같은 규칙), 아직 안 보낸 알림을 웹 푸시로 보낸다.
// 사용자 요청 없이 돌아야 하므로 service_role 키를 쓴다. 이 키는 이 모듈에서만 사용할 것.
import {
  collectNotifications,
  todayKst,
  type CalendarEvent,
  type NotificationDraft,
  type Task,
} from '@kingtepad/shared';
import { createClient } from '@supabase/supabase-js';
import type { FastifyBaseLogger } from 'fastify';
import webpush from 'web-push';

const INTERVAL_MS = 60_000;

type Owned<T> = T & { user_id: string };

interface PendingRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  link: string;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface Notifier {
  /** 모든 사용자에게 알림을 넣고 바로 푸시한다. 주인을 모르는 에이전트 상태용 */
  notifyOwners(n: NotificationDraft): Promise<void>;
  /** 한 사용자에게 알림을 넣고 바로 푸시한다. 사용자 요청 밖에서 생기는 알림(에이전트 모니터)용 */
  notifyUser(userId: string, n: NotificationDraft): Promise<void>;
  /** 가장 먼저 가입한 계정(관리자). 계정 토큰 없이 보낸 기존 잡의 주인으로 쓴다 */
  firstUserId(): Promise<string | null>;
}

export function startNotifier(log: FastifyBaseLogger): Notifier | null {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    log.warn('SUPABASE_SERVICE_ROLE_KEY 가 없어 알림 스케줄러를 끕니다.');
    return null;
  }
  const pushEnabled = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
  if (pushEnabled) webpush.setVapidDetails(VAPID_SUBJECT ?? 'mailto:admin@example.com', VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  else log.warn('VAPID 키가 없어 웹 푸시는 보내지 않습니다 (알림함 생성만 동작).');

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function generate() {
    const today = todayKst();
    const [tasks, events, holidays] = await Promise.all([
      db.from('tasks').select('*').is('deleted_at', null).lt('progress', 100),
      db.from('events').select('*').neq('alarms', '{}').gte('start_date', today),
      db.from('holidays').select('date'),
    ]);
    const err = tasks.error ?? events.error ?? holidays.error;
    if (err) throw new Error(err.message);

    const holidaySet = new Set((holidays.data as { date: string }[]).map((h) => h.date));
    const users = new Set([...(tasks.data as Owned<Task>[]), ...(events.data as Owned<CalendarEvent>[])].map((r) => r.user_id));
    const rows = [...users].flatMap((user_id) =>
      collectNotifications(new Date(), {
        tasks: (tasks.data as Owned<Task>[]).filter((t) => t.user_id === user_id),
        events: (events.data as Owned<CalendarEvent>[]).filter((e) => e.user_id === user_id),
        holidays: holidaySet,
      }).map((n) => ({ ...n, user_id })),
    );
    if (rows.length === 0) return;
    const { error } = await db.from('notifications').upsert(rows, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  async function push() {
    // 너무 오래된 미발송 알림(서버 중단 등)은 푸시하지 않고 발송 처리만 한다
    const since = new Date(Date.now() - 6 * 3_600_000).toISOString();
    const pending = await db.from('notifications').select('id,user_id,title,body,link,created_at').is('pushed_at', null);
    if (pending.error) throw new Error(pending.error.message);
    const rows = pending.data as (PendingRow & { created_at: string })[];
    if (rows.length === 0) return;

    if (pushEnabled) {
      const userIds = [...new Set(rows.map((r) => r.user_id))];
      const [subs, unread] = await Promise.all([
        db.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').in('user_id', userIds),
        db.from('notifications').select('user_id').in('user_id', userIds).is('read_at', null),
      ]);
      if (subs.error || unread.error) throw new Error((subs.error ?? unread.error)!.message);
      const badge = (uid: string) => (unread.data as { user_id: string }[]).filter((r) => r.user_id === uid).length;

      for (const n of rows.filter((r) => r.created_at >= since)) {
        for (const s of (subs.data as SubscriptionRow[]).filter((s) => s.user_id === n.user_id)) {
          const payload = JSON.stringify({ title: n.title, body: n.body, url: n.link, tag: n.id, badge: badge(n.user_id) });
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            // 만료·해지된 구독은 지운다
            if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
            else log.error({ err: e, endpoint: s.endpoint }, '웹 푸시 실패');
          }
        }
      }
    }

    await db
      .from('notifications')
      .update({ pushed_at: new Date().toISOString() })
      .in('id', rows.map((r) => r.id));
  }

  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      await generate();
      await push();
    } catch (e) {
      log.error({ err: e }, '알림 스케줄러 오류');
    } finally {
      running = false;
    }
  }

  tick();
  setInterval(tick, INTERVAL_MS);
  log.info('알림 스케줄러 시작 (1분 주기)');

  async function insertNow(rows: (NotificationDraft & { user_id: string })[]) {
    if (rows.length === 0) return;
    const { error } = await db.from('notifications').upsert(rows, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    // 다음 주기(최대 1분)를 기다리지 않고 바로 푸시. 진행 중이면 그 주기가 처리한다
    tick();
  }

  let firstUser: Promise<string | null> | null = null;

  return {
    async notifyOwners(n) {
      const users = await db.auth.admin.listUsers();
      if (users.error) throw new Error(users.error.message);
      await insertNow(users.data.users.map((u) => ({ ...n, user_id: u.id })));
    },
    notifyUser: (userId, n) => insertNow([{ ...n, user_id: userId }]),
    firstUserId() {
      firstUser ??= db.auth.admin.listUsers().then(({ data, error }) => {
        if (error) {
          firstUser = null; // 다음에 다시 시도
          throw new Error(error.message);
        }
        const [first] = [...data.users].sort((a, b) => a.created_at.localeCompare(b.created_at));
        return first?.id ?? null;
      });
      return firstUser;
    },
  };
}

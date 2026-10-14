import { addDays, todayKst } from './dates';
import { taskStatus } from './status';
import type { CalendarEvent, DateStr, Task } from './types';
import type { HolidaySet } from './workdays';

export type NotificationKind = 'alarm' | 'delayed' | 'due_soon';

/** 알림 한 건. notifications 테이블에 dedupe_key 로 한 번만 저장된다 */
export interface NotificationDraft {
  kind: NotificationKind;
  title: string;
  body: string;
  link: string;
  dedupe_key: string;
  fire_at: string;
}

export interface AppNotification extends NotificationDraft {
  id: string;
  read_at: string | null;
  created_at: string;
}

/** 알람 프리셋 (시작 n분 전) */
export const ALARM_PRESETS = [30, 60, 1440];

/** 지연·마감 임박 알림을 보내는 시각 (KST 시) */
export const DAILY_ALERT_HOUR = 9;

/** 시간 없는 일정·업무의 알람 기준 시각 */
export const DEFAULT_START_TIME = '09:00';

export function formatAlarm(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440}일 전`;
  if (minutes % 60 === 0) return `${minutes / 60}시간 전`;
  return `${minutes}분 전`;
}

/** KST 날짜 + 'HH:MM' → 절대 시각 */
export function kstDateTime(date: DateStr, time: string | null = null): Date {
  return new Date(`${date}T${(time ?? DEFAULT_START_TIME).slice(0, 5)}:00+09:00`);
}

function kstHour(now: Date): number {
  return new Date(now.getTime() + 9 * 3_600_000).getUTCHours();
}

const hhmm = (d: Date) => new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(11, 16);

/**
 * 지금 시점에 나가야 할 알림을 모은다.
 * - 알람: 알람 시각이 지났고 아직 시작 전인 일정·업무 (시작 시각이 바뀌면 다시 울림)
 * - 지연: 오늘 지연 상태인 업무, 하루 한 번 (09시 이후)
 * - 마감 임박: 내일이 종료예정일인 미완료 업무 (09시 이후)
 */
export function collectNotifications(
  now: Date,
  data: { tasks: Task[]; events: CalendarEvent[]; holidays: HolidaySet },
): NotificationDraft[] {
  const today = todayKst(now);
  const out: NotificationDraft[] = [];
  const fired = now.toISOString();

  const pushAlarms = (
    key: string,
    start: Date,
    alarms: number[],
    make: (minutes: number) => Pick<NotificationDraft, 'title' | 'body' | 'link'>,
  ) => {
    if (start <= now) return;
    for (const minutes of alarms) {
      const at = new Date(start.getTime() - minutes * 60_000);
      if (at > now) continue;
      out.push({ kind: 'alarm', dedupe_key: `alarm:${key}:${minutes}:${start.toISOString()}`, fire_at: at.toISOString(), ...make(minutes) });
    }
  };

  for (const e of data.events) {
    if (!e.alarms?.length) continue;
    const start = kstDateTime(e.start_date, e.start_time);
    pushAlarms(`event:${e.id}`, start, e.alarms, (m) => ({
      title: `⏰ ${e.title}`,
      body: `${formatAlarm(m)} · ${e.start_date.slice(5)} ${e.start_time ? hhmm(start) : '종일'}`,
      link: `/calendar?view=day&date=${e.start_date}`,
    }));
  }

  const active = data.tasks.filter((t) => !t.deleted_at && t.progress < 100);
  for (const t of active) {
    if (!t.alarms?.length) continue;
    pushAlarms(`task:${t.id}`, kstDateTime(t.planned_start), t.alarms, (m) => ({
      title: `⏰ ${t.title}`,
      body: `${formatAlarm(m)} · ${t.planned_start.slice(5)} 시작 예정`,
      link: `/tasks/${t.id}`,
    }));
  }

  if (kstHour(now) >= DAILY_ALERT_HOUR) {
    const tomorrow = addDays(today, 1);
    for (const t of active) {
      if (taskStatus(t, today, data.holidays) === 'delayed') {
        out.push({
          kind: 'delayed',
          title: `🚨 지연: ${t.title}`,
          body: `진척 ${t.progress}% · 종료예정 ${t.planned_end.slice(5)}`,
          link: `/tasks/${t.id}`,
          dedupe_key: `delayed:${t.id}:${today}`,
          fire_at: fired,
        });
      }
      if (t.planned_end === tomorrow) {
        out.push({
          kind: 'due_soon',
          title: `⌛ 내일 마감: ${t.title}`,
          body: `진척 ${t.progress}% · 종료예정 ${t.planned_end.slice(5)}`,
          link: `/tasks/${t.id}`,
          dedupe_key: `due:${t.id}:${t.planned_end}`,
          fire_at: fired,
        });
      }
    }
  }
  return out;
}

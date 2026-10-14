import { describe, expect, it } from 'vitest';
import { collectNotifications, formatAlarm, type CalendarEvent, type Task } from './index';

const task = (patch: Partial<Task>): Task => ({
  id: 't1',
  category_id: null,
  title: '업무',
  description: '',
  planned_start: '2026-10-12',
  planned_end: '2026-10-16',
  actual_start: null,
  actual_end: null,
  progress: 0,
  tags: [],
  alarms: [],
  deleted_at: null,
  created_at: '',
  updated_at: '',
  ...patch,
});

const event = (patch: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'e1',
  kind: 'work',
  title: '회의',
  start_date: '2026-10-14',
  end_date: '2026-10-14',
  start_time: '14:00:00',
  end_time: null,
  task_id: null,
  memo: '',
  alarms: [],
  created_at: '',
  updated_at: '',
  ...patch,
});

const at = (kst: string) => new Date(`${kst}+09:00`);
const none = new Set<string>();

describe('formatAlarm', () => {
  it('일/시간/분 단위', () => {
    expect(formatAlarm(30)).toBe('30분 전');
    expect(formatAlarm(120)).toBe('2시간 전');
    expect(formatAlarm(2880)).toBe('2일 전');
  });
});

describe('collectNotifications', () => {
  it('일정 알람: 알람 시각이 지나고 시작 전일 때만', () => {
    const events = [event({ alarms: [30, 60] })];
    const kinds = (now: string) =>
      collectNotifications(at(now), { tasks: [], events, holidays: none }).map((n) => n.dedupe_key.split(':')[3]);
    expect(kinds('2026-10-14T12:59:00')).toEqual([]);
    expect(kinds('2026-10-14T13:00:00')).toEqual(['60']);
    expect(kinds('2026-10-14T13:45:00')).toEqual(['30', '60']);
    expect(kinds('2026-10-14T14:00:00')).toEqual([]); // 이미 시작
  });

  it('종일 일정은 09:00 기준', () => {
    const [n] = collectNotifications(at('2026-10-13T09:00:00'), {
      tasks: [],
      events: [event({ start_time: null, alarms: [1440] })],
      holidays: none,
    });
    expect(n?.body).toBe('1일 전 · 10-14 종일');
  });

  it('지연·내일 마감 업무는 09시 이후에만, 완료 업무는 제외', () => {
    const tasks = [
      task({ id: 'late', planned_start: '2026-10-05', planned_end: '2026-10-20', progress: 10 }),
      task({ id: 'due', planned_start: '2026-10-14', planned_end: '2026-10-15', progress: 50 }),
      task({ id: 'done', planned_start: '2026-10-05', planned_end: '2026-10-15', progress: 100 }),
    ];
    const keys = (now: string) =>
      collectNotifications(at(now), { tasks, events: [], holidays: none }).map((n) => n.dedupe_key);
    expect(keys('2026-10-14T08:59:00')).toEqual([]);
    expect(keys('2026-10-14T09:00:00')).toEqual(['delayed:late:2026-10-14', 'due:due:2026-10-15']);
  });
});

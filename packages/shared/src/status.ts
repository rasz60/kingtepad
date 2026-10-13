import type { DateStr, Task } from './types';
import { countWorkdays, type HolidaySet } from './workdays';

export type TaskStatus = 'planned' | 'in_progress' | 'delayed' | 'done' | 'deleted';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  planned: '예정',
  in_progress: '진행',
  delayed: '지연',
  done: '완료',
  deleted: '삭제',
};

/**
 * 예정 기간 대비 오늘까지 경과한 영업일 비율 (0~100).
 * 시작 전이면 null. 오늘은 경과한 날로 센다(오늘 끝낼 몫까지 기대치에 포함).
 */
export function expectedProgress(
  plannedStart: DateStr,
  plannedEnd: DateStr,
  today: DateStr,
  holidays: HolidaySet,
): number | null {
  if (today < plannedStart) return null;
  if (today >= plannedEnd) return 100;
  const total = countWorkdays(plannedStart, plannedEnd, holidays);
  if (total === 0) return 100;
  const elapsed = countWorkdays(plannedStart, today, holidays);
  return Math.round((elapsed / total) * 100);
}

export function taskStatus(
  task: Pick<Task, 'planned_start' | 'planned_end' | 'progress' | 'deleted_at'>,
  today: DateStr,
  holidays: HolidaySet,
): TaskStatus {
  if (task.deleted_at) return 'deleted';
  if (task.progress >= 100) return 'done';
  const expected = expectedProgress(task.planned_start, task.planned_end, today, holidays);
  if (expected === null) return 'planned';
  if (task.progress < expected) return 'delayed';
  return 'in_progress';
}

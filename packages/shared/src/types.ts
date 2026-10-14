// DB 행 타입 (supabase/migrations 와 일치시킬 것)

/** 'YYYY-MM-DD' */
export type DateStr = string;

export interface Category {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export interface Task {
  id: string;
  category_id: string | null;
  title: string;
  description: string;
  planned_start: DateStr;
  planned_end: DateStr;
  actual_start: DateStr | null;
  actual_end: DateStr | null;
  progress: number;
  tags: string[];
  /** 시작예정일 09:00 기준 n분 전 알람 */
  alarms: number[];
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkLog {
  id: string;
  task_id: string | null;
  log_date: DateStr;
  content: string;
  minutes: number;
  progress: number | null;
  created_at: string;
  updated_at: string;
}

export type TaskInput = Pick<
  Task,
  'category_id' | 'title' | 'description' | 'planned_start' | 'planned_end' | 'tags' | 'alarms'
>;

export type WorkLogInput = Pick<WorkLog, 'task_id' | 'log_date' | 'content' | 'minutes' | 'progress'>;

export type EventKind = 'personal' | 'work';

/** 캘린더 일정. start_time 이 null 이면 종일 일정 */
export interface CalendarEvent {
  id: string;
  kind: EventKind;
  title: string;
  start_date: DateStr;
  end_date: DateStr;
  /** 'HH:MM' 또는 'HH:MM:SS' */
  start_time: string | null;
  end_time: string | null;
  task_id: string | null;
  memo: string;
  /** 시작 시각(종일이면 09:00) 기준 n분 전 알람 */
  alarms: number[];
  created_at: string;
  updated_at: string;
}

export type CalendarEventInput = Pick<
  CalendarEvent,
  'kind' | 'title' | 'start_date' | 'end_date' | 'start_time' | 'end_time' | 'task_id' | 'memo' | 'alarms'
>;

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
  'category_id' | 'title' | 'description' | 'planned_start' | 'planned_end' | 'tags'
>;

export type WorkLogInput = Pick<WorkLog, 'task_id' | 'log_date' | 'content' | 'minutes' | 'progress'>;

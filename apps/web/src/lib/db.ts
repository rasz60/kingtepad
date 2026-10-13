// Supabase 데이터 접근. RLS 가 user_id 를 강제하므로 여기서는 user_id 를 다루지 않는다.
import type { Category, DateStr, Task, TaskInput, WorkLog, WorkLogInput } from '@kingtepad/shared';
import { supabase } from './supabase';

function must<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

// ── 카테고리 ─────────────────────────────
export async function listCategories(): Promise<Category[]> {
  return must(await supabase.from('categories').select('id,name,color,sort_order').order('sort_order'));
}

export async function saveCategory(c: Partial<Category> & { name: string }): Promise<void> {
  must(await supabase.from('categories').upsert(c).select());
}

export async function deleteCategory(id: string): Promise<void> {
  must(await supabase.from('categories').delete().eq('id', id));
}

// ── 공휴일 ───────────────────────────────
export async function listHolidays(): Promise<Set<DateStr>> {
  const rows = must(await supabase.from('holidays').select('date'));
  return new Set((rows as { date: DateStr }[]).map((r) => r.date));
}

// ── 업무 ─────────────────────────────────
export interface TaskQuery {
  from?: DateStr;
  to?: DateStr;
  categoryId?: string;
  q?: string;
  trash?: boolean;
}

export async function listTasks(query: TaskQuery = {}): Promise<Task[]> {
  let req = supabase.from('tasks').select('*');
  req = query.trash ? req.not('deleted_at', 'is', null) : req.is('deleted_at', null);
  // 기간이 겹치는 업무
  if (query.to) req = req.lte('planned_start', query.to);
  if (query.from) req = req.gte('planned_end', query.from);
  if (query.categoryId) req = req.eq('category_id', query.categoryId);
  if (query.q) {
    const q = query.q.replace(/[%,()]/g, ' ');
    req = req.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
  }
  return must(await req.order('planned_start', { ascending: false }).order('created_at', { ascending: false }));
}

export async function getTask(id: string): Promise<Task> {
  return must(await supabase.from('tasks').select('*').eq('id', id).single());
}

export async function createTask(input: TaskInput): Promise<Task> {
  return must(await supabase.from('tasks').insert(input).select().single());
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<Task> {
  return must(await supabase.from('tasks').update(patch).eq('id', id).select().single());
}

export const trashTask = (id: string) => updateTask(id, { deleted_at: new Date().toISOString() });
export const restoreTask = (id: string) => updateTask(id, { deleted_at: null });

export async function purgeTask(id: string): Promise<void> {
  must(await supabase.from('tasks').delete().eq('id', id));
}

// ── 일지 ─────────────────────────────────
export async function listLogs(query: { taskId?: string; from?: DateStr; to?: DateStr }): Promise<WorkLog[]> {
  let req = supabase.from('work_logs').select('*');
  if (query.taskId) req = req.eq('task_id', query.taskId);
  if (query.from) req = req.gte('log_date', query.from);
  if (query.to) req = req.lte('log_date', query.to);
  return must(await req.order('log_date', { ascending: false }).order('created_at', { ascending: false }));
}

export async function createLog(input: WorkLogInput): Promise<WorkLog> {
  return must(await supabase.from('work_logs').insert(input).select().single());
}

export async function updateLog(id: string, patch: Partial<WorkLogInput>): Promise<WorkLog> {
  return must(await supabase.from('work_logs').update(patch).eq('id', id).select().single());
}

export async function deleteLog(id: string): Promise<void> {
  must(await supabase.from('work_logs').delete().eq('id', id));
}

/** 진행 중인 업무의 기간 안팎 로그를 함께 보기 위해 업무를 id 목록으로 조회 */
export async function getTasksByIds(ids: string[]): Promise<Task[]> {
  if (ids.length === 0) return [];
  return must(await supabase.from('tasks').select('*').in('id', ids));
}

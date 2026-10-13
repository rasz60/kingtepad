import { addDays, formatMinutes } from './dates';
import { STATUS_LABEL, taskStatus } from './status';
import type { Category, DateStr, Task, WorkLog } from './types';
import { minutesToMD, type HolidaySet } from './workdays';

export interface ReportSummary {
  from: DateStr;
  to: DateStr;
  totalMinutes: number;
  byCategory: { name: string; color: string; minutes: number }[];
  byTask: { task: Task | null; minutes: number; logs: WorkLog[] }[];
}

const NO_CATEGORY = { name: '미분류', color: '#94a3b8' };

export function summarize(
  from: DateStr,
  to: DateStr,
  tasks: Task[],
  logs: WorkLog[],
  categories: Category[],
): ReportSummary {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const inRange = logs.filter((l) => l.log_date >= from && l.log_date <= to);

  const byTaskMap = new Map<string, { task: Task | null; minutes: number; logs: WorkLog[] }>();
  const byCatMap = new Map<string, { name: string; color: string; minutes: number }>();

  for (const log of inRange) {
    const task = log.task_id ? (taskById.get(log.task_id) ?? null) : null;
    const key = task?.id ?? '_none';
    const entry = byTaskMap.get(key) ?? { task, minutes: 0, logs: [] };
    entry.minutes += log.minutes;
    entry.logs.push(log);
    byTaskMap.set(key, entry);

    const cat = (task?.category_id && catById.get(task.category_id)) || NO_CATEGORY;
    const c = byCatMap.get(cat.name) ?? { name: cat.name, color: cat.color, minutes: 0 };
    c.minutes += log.minutes;
    byCatMap.set(cat.name, c);
  }

  for (const entry of byTaskMap.values()) {
    entry.logs.sort((a, b) => a.log_date.localeCompare(b.log_date));
  }

  return {
    from,
    to,
    totalMinutes: inRange.reduce((s, l) => s + l.minutes, 0),
    byCategory: [...byCatMap.values()].sort((a, b) => b.minutes - a.minutes),
    byTask: [...byTaskMap.values()].sort((a, b) => b.minutes - a.minutes),
  };
}

/** 주간 보고서 마크다운: 지난 기간 실적 + 다음 주 계획 */
export function buildReportMarkdown(
  summary: ReportSummary,
  tasks: Task[],
  holidays: HolidaySet,
): string {
  const lines: string[] = [];
  lines.push(`# 업무 보고 (${summary.from} ~ ${summary.to})`, '');
  lines.push(`총 투입: ${formatMinutes(summary.totalMinutes)} (${minutesToMD(summary.totalMinutes)} MD)`, '');

  lines.push('## 실적', '');
  for (const { task, minutes, logs } of summary.byTask) {
    const title = task ? task.title : '기타 업무';
    const progress = task ? ` — ${task.progress}%` : '';
    lines.push(`- **${title}**${progress} (${formatMinutes(minutes)})`);
    for (const log of logs) {
      const firstLine = log.content.split('\n').find((s) => s.trim()) ?? '';
      if (firstLine) lines.push(`  - ${log.log_date.slice(5)} ${firstLine.replace(/^[-*#\s]+/, '')}`);
    }
  }
  if (summary.byTask.length === 0) lines.push('- 기록 없음');
  lines.push('');

  const nextFrom = addDays(summary.to, 1);
  const nextTo = addDays(summary.to, 7);
  const upcoming = tasks.filter(
    (t) => !t.deleted_at && t.progress < 100 && t.planned_start <= nextTo && t.planned_end >= nextFrom,
  );
  lines.push('## 계획', '');
  for (const t of upcoming) {
    const status = STATUS_LABEL[taskStatus(t, nextFrom, holidays)];
    lines.push(`- ${t.title} (${t.planned_start.slice(5)} ~ ${t.planned_end.slice(5)}, ${t.progress}%, ${status})`);
  }
  if (upcoming.length === 0) lines.push('- 예정된 업무 없음');

  return lines.join('\n') + '\n';
}

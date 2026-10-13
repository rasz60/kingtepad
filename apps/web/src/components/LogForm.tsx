import { todayKst, type Task, type WorkLog, type WorkLogInput } from '@kingtepad/shared';
import { useState, type FormEvent } from 'react';
import { createLog, updateLog } from '../lib/db';
import { MarkdownEditor } from './Markdown';
import { Sheet } from './Sheet';

/** 일지 작성/수정. task 가 주어지면 해당 업무에 귀속, 아니면 업무 선택 가능 */
export function LogForm({
  log,
  task,
  tasks = [],
  onClose,
  onSaved,
}: {
  log?: WorkLog;
  task?: Task;
  tasks?: Task[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<WorkLogInput>({
    task_id: log?.task_id ?? task?.id ?? null,
    log_date: log?.log_date ?? todayKst(),
    content: log?.content ?? '',
    minutes: log?.minutes ?? 60,
    progress: log?.progress ?? task?.progress ?? null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof WorkLogInput>(k: K, v: WorkLogInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.content.trim()) return setError('작업 내용을 입력하세요.');
    setSaving(true);
    try {
      const input = { ...form, progress: form.task_id ? form.progress : null };
      if (log) await updateLog(log.id, input);
      else await createLog(input);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  const hours = Math.floor(form.minutes / 60);
  const mins = form.minutes % 60;

  return (
    <Sheet title={log ? '일지 수정' : '일지 작성'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {!task && (
          <label>
            업무
            <select
              value={form.task_id ?? ''}
              onChange={(e) => {
                const picked = tasks.find((t) => t.id === e.target.value);
                setForm((f) => ({ ...f, task_id: picked?.id ?? null, progress: picked?.progress ?? null }));
              }}
            >
              <option value="">(업무 없음 · 일반 기록)</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="form-row">
          <label>
            날짜
            <input type="date" value={form.log_date} onChange={(e) => set('log_date', e.target.value)} />
          </label>
          <label>
            투입 시간
            <span className="inline-inputs">
              <input
                type="number"
                min={0}
                max={24}
                value={hours}
                onChange={(e) => set('minutes', Number(e.target.value) * 60 + mins)}
              />
              시간
              <input
                type="number"
                min={0}
                max={59}
                step={10}
                value={mins}
                onChange={(e) => set('minutes', hours * 60 + Number(e.target.value))}
              />
              분
            </span>
          </label>
          {form.task_id && (
            <label>
              진척률 {form.progress ?? 0}%
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={form.progress ?? 0}
                onChange={(e) => set('progress', Number(e.target.value))}
              />
            </label>
          )}
        </div>
        <label className="block-label">작업 내용</label>
        <MarkdownEditor value={form.content} onChange={(v) => set('content', v)} rows={6} />
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

import { todayKst, type Task, type TaskInput } from '@kingtepad/shared';
import { useState, type FormEvent } from 'react';
import { useApp } from '../lib/AppContext';
import { createTask, updateTask } from '../lib/db';
import { notifyChanged } from '../lib/useAsync';
import { MarkdownEditor } from './Markdown';
import { AlarmPicker } from './AlarmPicker';
import { Sheet } from './Sheet';

export function TaskForm({ task, onClose, onSaved }: { task?: Task; onClose: () => void; onSaved: (t: Task) => void }) {
  const { categories } = useApp();
  const today = todayKst();
  const [form, setForm] = useState<TaskInput>({
    title: task?.title ?? '',
    category_id: task?.category_id ?? null,
    planned_start: task?.planned_start ?? today,
    planned_end: task?.planned_end ?? today,
    description: task?.description ?? '',
    tags: task?.tags ?? [],
    alarms: task?.alarms ?? [],
  });
  const [tagText, setTagText] = useState((task?.tags ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return setError('제목을 입력하세요.');
    if (form.planned_start > form.planned_end) return setError('종료예정일이 시작예정일보다 빠릅니다.');
    const tags = tagText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setSaving(true);
    try {
      const input = { ...form, title: form.title.trim(), tags };
      const saved = task ? await updateTask(task.id, input) : await createTask(input);
      notifyChanged();
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Sheet title={task ? '업무 수정' : '새 업무'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          제목
          <input value={form.title} onChange={(e) => set('title', e.target.value)} autoFocus maxLength={200} />
        </label>
        <div className="form-row">
          <label>
            카테고리
            <select value={form.category_id ?? ''} onChange={(e) => set('category_id', e.target.value || null)}>
              <option value="">미분류</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            시작예정
            <input type="date" value={form.planned_start} onChange={(e) => set('planned_start', e.target.value)} />
          </label>
          <label>
            종료예정
            <input type="date" value={form.planned_end} onChange={(e) => set('planned_end', e.target.value)} />
          </label>
        </div>
        <label>
          <span>태그 (쉼표로 구분)</span>
          <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="예: 고객사A, 긴급" />
        </label>
        <AlarmPicker value={form.alarms} onChange={(v) => set('alarms', v)} hint="시작예정일 09:00 기준" />
        <label className="block-label">업무 설명</label>
        <MarkdownEditor value={form.description} onChange={(v) => set('description', v)} />
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

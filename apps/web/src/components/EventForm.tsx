import { type CalendarEvent, type CalendarEventInput, type DateStr, type EventKind } from '@kingtepad/shared';
import { useState, type FormEvent } from 'react';
import { createEvent, deleteEvent, listTasks, updateEvent } from '../lib/db';
import { notifyChanged, useAsync } from '../lib/useAsync';
import { AlarmPicker } from './AlarmPicker';
import { Sheet } from './Sheet';

const KINDS: { value: EventKind; label: string }[] = [
  { value: 'personal', label: '개인 일정' },
  { value: 'work', label: '업무 일정' },
];

/** 일정 등록/수정. date 는 새 일정의 기본 날짜 */
export function EventForm({ event, date, onClose }: { event?: CalendarEvent; date?: DateStr; onClose: () => void }) {
  const [form, setForm] = useState<CalendarEventInput>({
    kind: event?.kind ?? 'personal',
    title: event?.title ?? '',
    start_date: event?.start_date ?? date ?? '',
    end_date: event?.end_date ?? date ?? '',
    start_time: event?.start_time?.slice(0, 5) ?? null,
    end_time: event?.end_time?.slice(0, 5) ?? null,
    task_id: event?.task_id ?? null,
    memo: event?.memo ?? '',
    alarms: event?.alarms ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof CalendarEventInput>(k: K, v: CalendarEventInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  // 업무 일정은 진행 중인 업무에 연결할 수 있다 (이미 연결된 업무는 완료됐어도 유지)
  const tasks = useAsync(
    async () => (await listTasks()).filter((t) => t.progress < 100 || t.id === event?.task_id),
    [event?.task_id],
  );
  const allDay = form.start_time === null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return setError('제목을 입력하세요.');
    if (!form.start_date || !form.end_date) return setError('날짜를 입력하세요.');
    if (form.start_date > form.end_date) return setError('종료일이 시작일보다 빠릅니다.');
    if (!allDay && !form.start_time) return setError('시작 시간을 입력하세요.');
    if (
      !allDay &&
      form.end_time &&
      form.start_date === form.end_date &&
      form.end_time < form.start_time!
    )
      return setError('종료 시간이 시작 시간보다 빠릅니다.');
    setSaving(true);
    try {
      const input: CalendarEventInput = {
        ...form,
        title: form.title.trim(),
        end_time: allDay ? null : form.end_time || null,
        task_id: form.kind === 'work' ? form.task_id : null,
      };
      if (event) await updateEvent(event.id, input);
      else await createEvent(input);
      notifyChanged();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  async function remove() {
    if (!event || !window.confirm('일정을 삭제할까요?')) return;
    await deleteEvent(event.id);
    notifyChanged();
    onClose();
  }

  return (
    <Sheet title={event ? '일정 수정' : '일정 등록'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="seg" role="radiogroup" aria-label="일정 종류">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={form.kind === k.value}
              className={`seg-btn ev-${k.value} ${form.kind === k.value ? 'active' : ''}`}
              onClick={() => set('kind', k.value)}
            >
              {k.label}
            </button>
          ))}
        </div>
        <label>
          제목
          <input value={form.title} onChange={(e) => set('title', e.target.value)} autoFocus maxLength={200} />
        </label>
        <div className="form-row">
          <label>
            시작일
            <input
              type="date"
              value={form.start_date}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  start_date: e.target.value,
                  // 하루짜리 일정이면 종료일도 같이 움직인다
                  end_date: !f.end_date || f.end_date === f.start_date ? e.target.value : f.end_date,
                }))
              }
            />
          </label>
          <label>
            종료일
            <input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
          </label>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                start_time: e.target.checked ? null : '09:00',
                end_time: e.target.checked ? null : '10:00',
              }))
            }
          />
          종일
        </label>
        {!allDay && (
          <div className="form-row">
            <label>
              시작 시간
              <input type="time" value={form.start_time ?? ''} onChange={(e) => set('start_time', e.target.value)} />
            </label>
            <label>
              종료 시간
              <input type="time" value={form.end_time ?? ''} onChange={(e) => set('end_time', e.target.value || null)} />
            </label>
          </div>
        )}
        {form.kind === 'work' && (
          <label>
            연결 업무 (선택)
            <select value={form.task_id ?? ''} onChange={(e) => set('task_id', e.target.value || null)}>
              <option value="">(연결 안 함)</option>
              {(tasks.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <AlarmPicker
          value={form.alarms}
          onChange={(v) => set('alarms', v)}
          hint={allDay ? '종일 일정은 시작일 09:00 기준' : '시작 시간 기준'}
        />
        <label>
          메모
          <textarea value={form.memo} onChange={(e) => set('memo', e.target.value)} rows={3} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          {event && (
            <button type="button" className="btn-danger" onClick={remove} style={{ marginRight: 'auto' }}>
              삭제
            </button>
          )}
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

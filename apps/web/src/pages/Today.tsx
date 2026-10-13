import { formatMinutes, parseQuickEntry, taskStatus, todayKst, type Task } from '@kingtepad/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LogForm } from '../components/LogForm';
import { Markdown } from '../components/Markdown';
import { TaskRow } from '../components/TaskRow';
import { useApp } from '../lib/AppContext';
import { createLog, createTask, listLogs, listTasks } from '../lib/db';
import { useAsync } from '../lib/useAsync';

export function Today() {
  const { holidays, categories } = useApp();
  const today = todayKst();

  const tasks = useAsync(() => listTasks(), []);
  const logs = useAsync(() => listLogs({ from: today, to: today }), [today]);
  const [showLogForm, setShowLogForm] = useState(false);

  const active = (tasks.data ?? []).filter((t) => t.progress < 100 && t.planned_start <= today);
  const delayed = active.filter((t) => taskStatus(t, today, holidays) === 'delayed');
  const ongoing = active.filter((t) => taskStatus(t, today, holidays) === 'in_progress');
  const todayLogs = logs.data ?? [];
  const todayMinutes = todayLogs.reduce((s, l) => s + l.minutes, 0);
  const taskTitle = (id: string | null) => tasks.data?.find((t) => t.id === id)?.title ?? '일반 기록';

  const reloadAll = () => {
    tasks.reload();
    logs.reload();
  };

  // ── 빠른 입력 ─────────────────────────
  const [quick, setQuick] = useState('');
  const [quickTask, setQuickTask] = useState('');
  const [quickError, setQuickError] = useState('');
  const parsed = parseQuickEntry(quick);

  async function submitQuick(e: FormEvent) {
    e.preventDefault();
    setQuickError('');
    if (!parsed.text) return;
    try {
      let taskId: string | null = quickTask || null;
      if (!taskId && parsed.category) {
        const cat = categories.find((c) => c.name === parsed.category);
        if (!cat) return setQuickError(`'${parsed.category}' 카테고리가 없습니다.`);
        const created = await createTask({
          title: parsed.text,
          category_id: cat.id,
          planned_start: today,
          planned_end: today,
          description: '',
          tags: [],
        });
        taskId = created.id;
      }
      await createLog({
        task_id: taskId,
        log_date: today,
        content: parsed.text,
        minutes: parsed.minutes,
        progress: taskId ? (parsed.progress ?? (quickTask ? null : 100)) : null,
      });
      setQuick('');
      setQuickTask('');
      reloadAll();
    } catch (err) {
      setQuickError((err as Error).message);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>오늘 · {today}</h1>
        <button className="btn-primary" onClick={() => setShowLogForm(true)}>
          + 일지
        </button>
      </header>

      <form className="card quick" onSubmit={submitQuick}>
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          placeholder="#개발 로그인 API 수정 1h30m 60%"
          aria-label="빠른 입력"
        />
        <select value={quickTask} onChange={(e) => setQuickTask(e.target.value)} aria-label="업무 선택">
          <option value="">업무 선택 안 함</option>
          {active.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <button className="btn-primary" disabled={!parsed.text}>
          기록
        </button>
        {quick && (
          <p className="quick-hint muted">
            {quickTask ? '선택한 업무에 일지 추가' : parsed.category ? `[${parsed.category}] 당일 업무로 생성` : '일반 기록'}
            {parsed.minutes > 0 && ` · ${formatMinutes(parsed.minutes)}`}
            {parsed.progress != null && ` · ${parsed.progress}%`}
          </p>
        )}
        {quickError && <p className="error">{quickError}</p>}
      </form>

      <TaskSection title="🚨 지연" tasks={delayed} empty="지연된 업무가 없어요." />
      <TaskSection title="▶️ 진행 중" tasks={ongoing} empty="진행 중인 업무가 없어요." />

      <section>
        <h2 className="section-title">
          📝 오늘 기록 <span className="muted">{formatMinutes(todayMinutes)}</span>
        </h2>
        {todayLogs.length === 0 && <p className="muted empty">아직 기록이 없어요.</p>}
        <ul className="log-list">
          {todayLogs.map((l) => (
            <li key={l.id} className="card log-item">
              <div className="log-meta">
                {l.task_id ? <Link to={`/tasks/${l.task_id}`}>{taskTitle(l.task_id)}</Link> : <span>일반 기록</span>}
                <span className="muted">{formatMinutes(l.minutes)}</span>
                {l.progress != null && <span className="muted">{l.progress}%</span>}
              </div>
              <Markdown source={l.content} />
            </li>
          ))}
        </ul>
      </section>

      {showLogForm && (
        <LogForm
          tasks={active}
          onClose={() => setShowLogForm(false)}
          onSaved={() => {
            setShowLogForm(false);
            reloadAll();
          }}
        />
      )}
    </div>
  );
}

function TaskSection({ title, tasks, empty }: { title: string; tasks: Task[]; empty: string }) {
  return (
    <section>
      <h2 className="section-title">
        {title} <span className="muted">{tasks.length}</span>
      </h2>
      {tasks.length === 0 && <p className="muted empty">{empty}</p>}
      <ul className="task-list">
        {tasks.map((t) => (
          <li key={t.id}>
            <TaskRow task={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}

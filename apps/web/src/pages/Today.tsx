import { formatMinutes, parseQuickEntry, taskStatus, todayKst, type Task } from '@kingtepad/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Markdown } from '../components/Markdown';
import { Empty } from '../components/Pixel';
import { TaskRow } from '../components/TaskRow';
import { useApp } from '../lib/AppContext';
import { createLog, createTask, listLogs, listTasks } from '../lib/db';
import { notifyChanged, useAsync } from '../lib/useAsync';

export function Today() {
  const { holidays, categories } = useApp();
  const today = todayKst();

  const tasks = useAsync(() => listTasks(), []);
  const logs = useAsync(() => listLogs({ from: today, to: today }), [today]);

  const active = (tasks.data ?? []).filter((t) => t.progress < 100 && t.planned_start <= today);
  const delayed = active.filter((t) => taskStatus(t, today, holidays) === 'delayed');
  const ongoing = active.filter((t) => taskStatus(t, today, holidays) === 'in_progress');
  const todayLogs = logs.data ?? [];
  const todayMinutes = todayLogs.reduce((s, l) => s + l.minutes, 0);
  const taskTitle = (id: string | null) => tasks.data?.find((t) => t.id === id)?.title ?? '일반 기록';

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
        if (!cat) return setQuickError(`'${parsed.category}' 카테고리가 없어요.`);
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
      notifyChanged();
    } catch (err) {
      setQuickError((err as Error).message);
    }
  }

  return (
    <div className="doc">
      <h1 className="ln h1">
        <span className="op"># </span>오늘의 업무 일지 <span className="num">{today}</span>
      </h1>
      <p className="ln comment">
        // 지연 {delayed.length} · 진행 {ongoing.length} · 오늘 {formatMinutes(todayMinutes)} 기록함
      </p>

      <form className="ln cmd" onSubmit={submitQuick}>
        <span className="cmd-prompt">&gt;</span>
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
          기록 ↵
        </button>
      </form>
      {quick && (
        <p className="ln cmd-preview">
          <span className="comment">// 해석: </span>
          {parsed.category && <span className="kw">#{parsed.category} </span>}
          <span>{parsed.text || '…'}</span>
          {parsed.minutes > 0 && <span className="dur"> {formatMinutes(parsed.minutes)}</span>}
          {parsed.progress != null && <span className="num"> {parsed.progress}%</span>}
          <span className="comment">
            {'  → '}
            {quickTask ? '선택한 업무에 일지 추가' : parsed.category ? '당일 업무로 새로 만들기' : '일반 기록'}
          </span>
        </p>
      )}
      {quickError && <p className="ln error">{quickError}</p>}

      <TaskSection title="지연된 업무" tasks={delayed} empty="지연된 업무가 없어요!" />
      <TaskSection title="진행 중인 업무" tasks={ongoing} empty="진행 중인 업무가 없어요." />

      <h2 className="ln comment section">
        // 오늘 기록 <span className="dur">{formatMinutes(todayMinutes)}</span>
      </h2>
      {logs.data && todayLogs.length === 0 && <Empty>아직 오늘 기록이 없어요</Empty>}
      {todayLogs.map((l) => (
        <div key={l.id} className="ln log-line">
          <div className="log-head">
            {l.task_id ? (
              <Link to={`/tasks/${l.task_id}`} className="kw">
                {taskTitle(l.task_id)}
              </Link>
            ) : (
              <span className="str">일반 기록</span>
            )}
            <span className="dur">{formatMinutes(l.minutes)}</span>
            {l.progress != null && <span className="num">→ {l.progress}%</span>}
          </div>
          <Markdown source={l.content} />
        </div>
      ))}
    </div>
  );
}

function TaskSection({ title, tasks, empty }: { title: string; tasks: Task[]; empty: string }) {
  return (
    <>
      <h2 className="ln comment section">
        // {title} <span className="num">({tasks.length})</span>
      </h2>
      {tasks.length === 0 ? <Empty>{empty}</Empty> : tasks.map((t) => <TaskRow key={t.id} task={t} />)}
    </>
  );
}

import {
  addDays,
  buildReportMarkdown,
  formatMinutes,
  minutesToMD,
  startOfWeek,
  summarize,
  todayKst,
} from '@kingtepad/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Markdown } from '../components/Markdown';
import { useApp } from '../lib/AppContext';
import { listLogs, listTasks } from '../lib/db';
import { useAsync } from '../lib/useAsync';

export function Reports() {
  const { categories, holidays } = useApp();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayKst()));
  const weekEnd = addDays(weekStart, 6);

  const data = useAsync(async () => {
    const [logs, tasks] = await Promise.all([listLogs({ from: weekStart, to: weekEnd }), listTasks()]);
    return { logs, tasks };
  }, [weekStart]);

  const [copied, setCopied] = useState(false);

  if (!data.data) return <div className="page"><p className="muted">불러오는 중…</p></div>;
  const { logs, tasks } = data.data;
  const summary = summarize(weekStart, weekEnd, tasks, logs, categories);
  const markdown = buildReportMarkdown(summary, tasks, holidays);
  const max = Math.max(1, ...summary.byCategory.map((c) => c.minutes));

  async function copy() {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `업무보고_${weekStart}.md` });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>주간 보고서</h1>
        <div className="week-nav">
          <button className="btn-ghost" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="이전 주">
            ‹
          </button>
          <span>
            {weekStart.slice(5)} ~ {weekEnd.slice(5)}
          </span>
          <button className="btn-ghost" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="다음 주">
            ›
          </button>
        </div>
      </header>

      <div className="stats">
        <div className="card stat">
          <span className="label">총 투입</span>
          <strong>{formatMinutes(summary.totalMinutes)}</strong>
          <span className="muted">{minutesToMD(summary.totalMinutes)} MD</span>
        </div>
        <div className="card stat">
          <span className="label">작업한 업무</span>
          <strong>{summary.byTask.filter((t) => t.task).length}건</strong>
          <span className="muted">일지 {logs.length}개</span>
        </div>
      </div>

      <section>
        <h2 className="section-title">카테고리별 투입 시간</h2>
        <div className="card">
          {summary.byCategory.length === 0 && <p className="muted">이번 주 기록이 없어요.</p>}
          <ul className="bars">
            {summary.byCategory.map((c) => (
              <li key={c.name} title={`${c.name}: ${formatMinutes(c.minutes)}`}>
                <span className="bar-label">
                  <span className="dot" style={{ background: c.color }} /> {c.name}
                </span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${(c.minutes / max) * 100}%` }} />
                </span>
                <span className="bar-value">{formatMinutes(c.minutes)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h2 className="section-title">업무별</h2>
        <ul className="task-list">
          {summary.byTask.map(({ task, minutes, logs }) => (
            <li key={task?.id ?? '_none'} className="card task-summary">
              {task ? <Link to={`/tasks/${task.id}`}>{task.title}</Link> : <span>기타 업무</span>}
              <span className="muted">
                {formatMinutes(minutes)} · 일지 {logs.length}
                {task && ` · ${task.progress}%`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="page-header">
          <h2 className="section-title">보고서 미리보기</h2>
          <div className="actions">
            <button className="btn-ghost" onClick={download}>
              .md 저장
            </button>
            <button className="btn-primary" onClick={copy}>
              {copied ? '복사됨 ✓' : '마크다운 복사'}
            </button>
          </div>
        </div>
        <div className="card">
          <Markdown source={markdown} />
        </div>
      </section>
    </div>
  );
}

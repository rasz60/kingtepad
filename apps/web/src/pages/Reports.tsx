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
import { Empty, Pixel } from '../components/Pixel';
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

  if (!data.data) return <div className="doc"><p className="ln comment">// 불러오는 중…</p></div>;
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
    <div className="doc">
      <h1 className="ln h1">
        <span className="op"># </span>주간 보고서
      </h1>
      <div className="ln week-nav">
        <button className="btn-ghost" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="이전 주">
          ◀
        </button>
        <span className="num">
          {weekStart} ~ {weekEnd}
        </span>
        <button className="btn-ghost" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="다음 주">
          ▶
        </button>
      </div>

      <div className="ln stats">
        <div className="stat">
          <span className="comment">// 총 투입</span>
          <strong className="dur">{formatMinutes(summary.totalMinutes)}</strong>
          <span className="num">{minutesToMD(summary.totalMinutes)} MD</span>
        </div>
        <div className="stat">
          <span className="comment">// 작업한 업무</span>
          <strong>{summary.byTask.filter((t) => t.task).length}건</strong>
          <span className="num">일지 {logs.length}개</span>
        </div>
      </div>

      <h2 className="ln comment section">// 카테고리별 투입 시간</h2>
      {summary.byCategory.length === 0 && <Empty>이번 주 기록이 없어요</Empty>}
      {summary.byCategory.map((c) => (
        <div key={c.name} className="ln bar-line" title={`${c.name}: ${formatMinutes(c.minutes)}`}>
          <span className="kw bar-label">
            <i className="swatch" style={{ background: c.color }} />
            {c.name}
          </span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(c.minutes / max) * 100}%` }} />
          </span>
          <span className="bar-value">{formatMinutes(c.minutes)}</span>
        </div>
      ))}

      <h2 className="ln comment section">// 업무별</h2>
      {summary.byTask.map(({ task, minutes, logs }) => (
        <p key={task?.id ?? '_none'} className="ln task-summary">
          {task ? (
            <Link to={`/tasks/${task.id}`} className="kw">
              {task.title}
            </Link>
          ) : (
            <span className="str">기타 업무</span>
          )}
          <span>
            <span className="dur">{formatMinutes(minutes)}</span>
            <span className="comment"> · 일지 {logs.length}</span>
            {task && <span className="num"> · {task.progress}%</span>}
          </span>
        </p>
      ))}

      <h2 className="ln comment section">// 보고서 원문 (업무보고_{weekStart}.md)</h2>
      <div className="ln actions">
        <button className="btn-primary" onClick={copy}>
          <Pixel name="copy" /> {copied ? '복사됨!' : '마크다운 복사'}
        </button>
        <button className="btn-ghost" onClick={download}>
          <Pixel name="floppy" /> .md 저장
        </button>
      </div>
      {markdown.trimEnd().split('\n').map((line, i) => (
        <MdLine key={i} line={line} />
      ))}
    </div>
  );
}

/** 마크다운 한 줄을 Notepad++ 마크다운 하이라이트처럼 표시 */
function MdLine({ line }: { line: string }) {
  if (!line) return <p className="ln src">&nbsp;</p>;
  if (line.startsWith('#')) return <p className="ln src md-h">{line}</p>;
  const m = line.match(/^(\s*-\s)(.*)$/);
  if (!m) return <p className="ln src">{line}</p>;
  // **굵게**, (괄호 메타), 날짜 강조
  const parts = m[2]!.split(/(\*\*[^*]+\*\*|\([^)]*\)|\d{2}-\d{2})/g);
  return (
    <p className="ln src">
      <span className="op">{m[1]}</span>
      {parts.map((p, i) =>
        p.startsWith('**') ? (
          <b key={i} className="kw">{p}</b>
        ) : p.startsWith('(') ? (
          <span key={i} className="dur">{p}</span>
        ) : /^\d{2}-\d{2}$/.test(p) ? (
          <span key={i} className="num">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

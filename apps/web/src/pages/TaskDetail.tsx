import {
  countWorkdays,
  expectedProgress,
  formatMinutes,
  minutesToMD,
  taskStatus,
  todayKst,
  type WorkLog,
} from '@kingtepad/shared';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LogForm } from '../components/LogForm';
import { Markdown } from '../components/Markdown';
import { ProgressBar, StatusBadge } from '../components/StatusBadge';
import { TaskForm } from '../components/TaskForm';
import { useApp } from '../lib/AppContext';
import { deleteLog, getTask, listLogs, purgeTask, restoreTask, trashTask } from '../lib/db';
import { useAsync } from '../lib/useAsync';

export function TaskDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { holidays, categoryById } = useApp();
  const task = useAsync(() => getTask(id), [id]);
  const logs = useAsync(() => listLogs({ taskId: id }), [id]);
  const [editing, setEditing] = useState(false);
  const [logForm, setLogForm] = useState<{ log?: WorkLog } | null>(null);

  if (task.error) return <div className="page"><p className="error">업무를 찾을 수 없습니다.</p></div>;
  const t = task.data;
  if (!t) return <div className="page"><p className="muted">불러오는 중…</p></div>;

  const today = todayKst();
  const expected = expectedProgress(t.planned_start, t.planned_end, today, holidays);
  const totalMinutes = (logs.data ?? []).reduce((s, l) => s + l.minutes, 0);
  const plannedDays = countWorkdays(t.planned_start, t.planned_end, holidays);
  const cat = categoryById(t.category_id);

  const reloadAll = () => {
    task.reload();
    logs.reload();
  };

  async function act(fn: () => Promise<unknown>, confirmMsg: string, after?: () => void) {
    if (!window.confirm(confirmMsg)) return;
    await fn();
    after ? after() : reloadAll();
  }

  return (
    <div className="page">
      <Link to="/tasks" className="back">
        ← 업무 목록
      </Link>
      <header className="page-header">
        <h1>{t.title}</h1>
        <StatusBadge status={taskStatus(t, today, holidays)} />
      </header>

      <div className="card detail-grid">
        <div>
          <span className="label">카테고리</span>
          <span>
            <span className="dot" style={{ background: cat?.color ?? '#94a3b8' }} /> {cat?.name ?? '미분류'}
          </span>
        </div>
        <div>
          <span className="label">예정 기간</span>
          <span>
            {t.planned_start} ~ {t.planned_end} <span className="muted">({plannedDays}영업일)</span>
          </span>
        </div>
        <div>
          <span className="label">실제 기간</span>
          <span>
            {t.actual_start ?? '-'} ~ {t.actual_end ?? (t.actual_start ? '진행 중' : '-')}
          </span>
        </div>
        <div>
          <span className="label">투입 공수</span>
          <span>
            {formatMinutes(totalMinutes)} <span className="muted">({minutesToMD(totalMinutes)} MD)</span>
          </span>
        </div>
        <div className="span-all">
          <span className="label">
            진척 {t.progress}% <span className="muted">/ 예상 {expected ?? 0}%</span>
          </span>
          <ProgressBar value={t.progress} expected={expected} />
        </div>
        {t.tags.length > 0 && (
          <div className="span-all tags">
            {t.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="actions">
        {t.deleted_at ? (
          <>
            <button className="btn-ghost" onClick={() => act(() => restoreTask(t.id), '업무를 복원할까요?')}>
              복원
            </button>
            <button
              className="btn-danger"
              onClick={() => act(() => purgeTask(t.id), '영구 삭제하면 일지도 함께 삭제됩니다. 계속할까요?', () => navigate('/tasks?trash=1'))}
            >
              영구 삭제
            </button>
          </>
        ) : (
          <>
            <button className="btn-ghost" onClick={() => setEditing(true)}>
              수정
            </button>
            <button className="btn-danger" onClick={() => act(() => trashTask(t.id), '휴지통으로 옮길까요?', () => navigate('/tasks'))}>
              삭제
            </button>
            <button className="btn-primary" onClick={() => setLogForm({})}>
              + 일지
            </button>
          </>
        )}
      </div>

      <section>
        <h2 className="section-title">업무 설명</h2>
        <div className="card">
          <Markdown source={t.description} />
        </div>
      </section>

      <section>
        <h2 className="section-title">
          일지 <span className="muted">{logs.data?.length ?? 0}</span>
        </h2>
        {logs.data?.length === 0 && <p className="muted empty">아직 일지가 없어요.</p>}
        <ol className="timeline">
          {(logs.data ?? []).map((l) => (
            <li key={l.id} className="card log-item">
              <div className="log-meta">
                <strong>{l.log_date}</strong>
                <span className="muted">{formatMinutes(l.minutes)}</span>
                {l.progress != null && <span className="muted">→ {l.progress}%</span>}
                {!t.deleted_at && (
                  <span className="log-actions">
                    <button className="link-btn" onClick={() => setLogForm({ log: l })}>
                      수정
                    </button>
                    <button className="link-btn" onClick={() => act(() => deleteLog(l.id), '일지를 삭제할까요?')}>
                      삭제
                    </button>
                  </span>
                )}
              </div>
              <Markdown source={l.content} />
            </li>
          ))}
        </ol>
      </section>

      {editing && (
        <TaskForm
          task={t}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reloadAll();
          }}
        />
      )}
      {logForm && (
        <LogForm
          task={t}
          log={logForm.log}
          onClose={() => setLogForm(null)}
          onSaved={() => {
            setLogForm(null);
            reloadAll();
          }}
        />
      )}
    </div>
  );
}

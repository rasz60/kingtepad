import {
  countWorkdays,
  expectedProgress,
  formatMinutes,
  minutesToMD,
  taskStatus,
  todayKst,
  type WorkLog,
} from '@kingtepad/shared';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LogForm } from '../components/LogForm';
import { Markdown } from '../components/Markdown';
import { Empty, Pixel } from '../components/Pixel';
import { ProgressBar, StatusBadge } from '../components/StatusBadge';
import { TaskForm } from '../components/TaskForm';
import { useApp } from '../lib/AppContext';
import { deleteLog, getTask, listLogs, purgeTask, restoreTask, trashTask } from '../lib/db';
import { notifyChanged, useAsync } from '../lib/useAsync';

export function TaskDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { holidays, categoryById } = useApp();
  const task = useAsync(() => getTask(id), [id]);
  const logs = useAsync(() => listLogs({ taskId: id }), [id]);
  const [editing, setEditing] = useState(false);
  const [logForm, setLogForm] = useState<{ log?: WorkLog } | null>(null);

  if (task.error) return <div className="doc"><Empty>업무를 찾을 수 없어요</Empty></div>;
  const t = task.data;
  if (!t) return <div className="doc"><p className="ln comment">// 불러오는 중…</p></div>;

  const today = todayKst();
  const expected = expectedProgress(t.planned_start, t.planned_end, today, holidays);
  const totalMinutes = (logs.data ?? []).reduce((s, l) => s + l.minutes, 0);
  const plannedDays = countWorkdays(t.planned_start, t.planned_end, holidays);
  const cat = categoryById(t.category_id);

  async function act(fn: () => Promise<unknown>, confirmMsg: string, after?: () => void) {
    if (!window.confirm(confirmMsg)) return;
    await fn();
    notifyChanged();
    after?.();
  }

  return (
    <div className="doc">
      <p className="ln">
        <Link to="/tasks" className="comment">
          ← 업무 목록
        </Link>
      </p>
      <h1 className="ln h1">
        <span className="op"># </span>
        {t.title} <StatusBadge status={taskStatus(t, today, holidays)} />
      </h1>

      <p className="ln op">---</p>
      <Prop k="카테고리">
        <span className="kw">
          <i className="swatch" style={{ background: cat?.color ?? '#94a3b8' }} />
          {cat?.name ?? '미분류'}
        </span>
      </Prop>
      <Prop k="예정 기간">
        <span className="num">
          {t.planned_start} ~ {t.planned_end}
        </span>{' '}
        <span className="comment">// {plannedDays}영업일</span>
      </Prop>
      <Prop k="실제 기간">
        <span className="num">
          {t.actual_start ?? '-'} ~ {t.actual_end ?? (t.actual_start ? '진행 중' : '-')}
        </span>
      </Prop>
      <Prop k="투입 공수">
        <span className="dur">{formatMinutes(totalMinutes)}</span>{' '}
        <span className="comment">// {minutesToMD(totalMinutes)} MD</span>
      </Prop>
      <Prop k="진척">
        <ProgressBar value={t.progress} expected={expected} /> <span className="num">{t.progress}%</span>{' '}
        <span className="comment">// 예상 {expected ?? 0}%</span>
      </Prop>
      {t.tags.length > 0 && (
        <Prop k="태그">
          {t.tags.map((tag, i) => (
            <span key={tag} className="str">
              {i > 0 && ', '}"{tag}"
            </span>
          ))}
        </Prop>
      )}
      <p className="ln op">---</p>

      <div className="ln actions">
        {t.deleted_at ? (
          <>
            <button className="btn-ghost" onClick={() => act(() => restoreTask(t.id), '업무를 복원할까요?')}>
              <Pixel name="undo" /> 복원
            </button>
            <button
              className="btn-danger"
              onClick={() =>
                act(() => purgeTask(t.id), '영구 삭제하면 일지도 함께 삭제돼요. 계속할까요?', () => navigate('/tasks?trash=1'))
              }
            >
              <Pixel name="trash" /> 영구 삭제
            </button>
          </>
        ) : (
          <>
            <button className="btn-primary" onClick={() => setLogForm({})}>
              <Pixel name="pencil" /> 일지 쓰기
            </button>
            <button className="btn-ghost" onClick={() => setEditing(true)}>
              <Pixel name="doc" /> 수정
            </button>
            <button className="btn-danger" onClick={() => act(() => trashTask(t.id), '휴지통으로 옮길까요?', () => navigate('/tasks'))}>
              <Pixel name="trash" /> 삭제
            </button>
          </>
        )}
      </div>

      <h2 className="ln comment section">// 업무 설명</h2>
      <div className="ln">
        <Markdown source={t.description} empty="(설명 없음)" />
      </div>

      <h2 className="ln comment section">
        // 일지 <span className="num">({logs.data?.length ?? 0})</span>
      </h2>
      {logs.data?.length === 0 && <Empty>첫 일지를 써 볼까요?</Empty>}
      {(logs.data ?? []).map((l) => (
        <div key={l.id} className="ln log-line">
          <div className="log-head">
            <span className="num">{l.log_date}</span>
            <span className="dur">{formatMinutes(l.minutes)}</span>
            {l.progress != null && <span className="num">→ {l.progress}%</span>}
            {!t.deleted_at && (
              <span className="log-actions">
                <button className="link-btn" onClick={() => setLogForm({ log: l })}>
                  수정
                </button>
                <button className="link-btn danger" onClick={() => act(() => deleteLog(l.id), '일지를 삭제할까요?')}>
                  삭제
                </button>
              </span>
            )}
          </div>
          <Markdown source={l.content} />
        </div>
      ))}

      {editing && <TaskForm task={t} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
      {logForm && <LogForm task={t} log={logForm.log} onClose={() => setLogForm(null)} onSaved={() => setLogForm(null)} />}
    </div>
  );
}

function Prop({ k, children }: { k: string; children: ReactNode }) {
  return (
    <p className="ln prop">
      <span className="type">{k}</span>
      <span className="op">: </span>
      <span className="prop-val">{children}</span>
    </p>
  );
}

import { STATUS_LABEL, taskStatus, todayKst, type TaskStatus } from '@kingtepad/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TaskForm } from '../components/TaskForm';
import { TaskRow } from '../components/TaskRow';
import { useApp } from '../lib/AppContext';
import { listTasks } from '../lib/db';
import { useAsync } from '../lib/useAsync';

const PAGE_SIZE = 20;
const STATUSES: TaskStatus[] = ['planned', 'in_progress', 'delayed', 'done'];

export function Tasks() {
  const { categories, holidays } = useApp();
  const navigate = useNavigate();
  // 필터는 URL 에 유지 (뒤로 가기·새로고침해도 보존)
  const [params, setParams] = useSearchParams();
  const f = {
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    category: params.get('category') ?? '',
    status: (params.get('status') ?? '') as TaskStatus | '',
    q: params.get('q') ?? '',
    trash: params.get('trash') === '1',
  };
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const [qInput, setQInput] = useState(f.q);
  useEffect(() => {
    const id = setTimeout(() => qInput !== f.q && setFilter('q', qInput), 300);
    return () => clearTimeout(id);
  }, [qInput]);

  const { data, loading, error, reload } = useAsync(
    () => listTasks({ from: f.from || undefined, to: f.to || undefined, categoryId: f.category || undefined, q: f.q || undefined, trash: f.trash }),
    [f.from, f.to, f.category, f.q, f.trash],
  );

  const today = todayKst();
  const filtered = (data ?? []).filter((t) => !f.status || taskStatus(t, today, holidays) === f.status);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="page">
      <header className="page-header">
        <h1>{f.trash ? '휴지통' : '업무'}</h1>
        {!f.trash && (
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + 새 업무
          </button>
        )}
      </header>

      <div className="card filters">
        <input type="search" placeholder="제목·내용 검색" value={qInput} onChange={(e) => setQInput(e.target.value)} />
        <input type="date" value={f.from} onChange={(e) => setFilter('from', e.target.value)} aria-label="시작일" />
        <input type="date" value={f.to} onChange={(e) => setFilter('to', e.target.value)} aria-label="종료일" />
        <select value={f.category} onChange={(e) => setFilter('category', e.target.value)} aria-label="카테고리">
          <option value="">전체 카테고리</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {!f.trash && (
          <select value={f.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="상태">
            <option value="">전체 상태</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        )}
        <label className="check">
          <input type="checkbox" checked={f.trash} onChange={(e) => setFilter('trash', e.target.checked ? '1' : '')} />
          휴지통
        </label>
        <button
          className="btn-ghost"
          onClick={() => {
            setQInput('');
            setParams({}, { replace: true });
          }}
        >
          초기화
        </button>
      </div>

      <p className="muted count">총 {filtered.length}건</p>
      {error && <p className="error">{error.message}</p>}
      {loading && !data && <p className="muted">불러오는 중…</p>}
      {data && filtered.length === 0 && <p className="muted empty">조회된 업무가 없어요.</p>}

      <ul className="task-list">
        {filtered.slice(0, limit).map((t) => (
          <li key={t.id}>
            <TaskRow task={t} />
          </li>
        ))}
      </ul>
      {filtered.length > limit && (
        <button className="btn-ghost more" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
          더 보기 ({filtered.length - limit})
        </button>
      )}

      {showForm && (
        <TaskForm
          onClose={() => setShowForm(false)}
          onSaved={(t) => {
            setShowForm(false);
            reload();
            navigate(`/tasks/${t.id}`);
          }}
        />
      )}
    </div>
  );
}

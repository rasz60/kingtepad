import { STATUS_LABEL, taskStatus, todayKst, type TaskStatus } from '@kingtepad/shared';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Empty } from '../components/Pixel';
import { TaskRow } from '../components/TaskRow';
import { useApp } from '../lib/AppContext';
import { listTasks } from '../lib/db';
import { useAsync } from '../lib/useAsync';

const PAGE_SIZE = 30;
const STATUSES: TaskStatus[] = ['planned', 'in_progress', 'delayed', 'done'];

export function Tasks() {
  const { categories, holidays } = useApp();
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

  // 툴바 검색 등 외부에서 q 가 바뀌면 입력값 동기화
  const [qInput, setQInput] = useState(f.q);
  useEffect(() => setQInput(f.q), [f.q]);
  useEffect(() => {
    const id = setTimeout(() => qInput !== f.q && setFilter('q', qInput), 300);
    return () => clearTimeout(id);
  }, [qInput]);

  const { data, error } = useAsync(
    () =>
      listTasks({
        from: f.from || undefined,
        to: f.to || undefined,
        categoryId: f.category || undefined,
        q: f.q || undefined,
        trash: f.trash,
      }),
    [f.from, f.to, f.category, f.q, f.trash],
  );

  const today = todayKst();
  const filtered = (data ?? []).filter((t) => !f.status || taskStatus(t, today, holidays) === f.status);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [moreFilters, setMoreFilters] = useState(false); // 모바일에서만 의미 있음

  return (
    <div className="doc">
      <h1 className="ln h1">
        <span className="op"># </span>
        {f.trash ? '휴지통' : '업무 목록'} <span className="num">({filtered.length})</span>
      </h1>

      <fieldset className={`find-panel ${moreFilters ? 'open' : ''}`}>
        <legend>찾기</legend>
        <label className="find-q">
          찾을 내용:
          <input type="search" placeholder="제목·내용" value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </label>
        <button type="button" className="btn-ghost find-toggle" onClick={() => setMoreFilters((v) => !v)}>
          {moreFilters ? '상세 조건 ▲' : '상세 조건 ▼'}
        </button>
        <label className="find-extra">
          기간:
          <span className="find-range">
            <input type="date" value={f.from} onChange={(e) => setFilter('from', e.target.value)} aria-label="시작일" />
            ~
            <input type="date" value={f.to} onChange={(e) => setFilter('to', e.target.value)} aria-label="종료일" />
          </span>
        </label>
        <label className="find-extra">
          카테고리:
          <select value={f.category} onChange={(e) => setFilter('category', e.target.value)}>
            <option value="">(전체)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {!f.trash && (
          <label className="find-extra">
            상태:
            <select value={f.status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">(전체)</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="check find-extra">
          <input type="checkbox" checked={f.trash} onChange={(e) => setFilter('trash', e.target.checked ? '1' : '')} />
          휴지통 보기
        </label>
        <button
          className="btn-ghost find-extra"
          onClick={() => {
            setQInput('');
            setParams({}, { replace: true });
          }}
        >
          초기화
        </button>
      </fieldset>

      {error && <p className="ln error">{error.message}</p>}
      {data && filtered.length === 0 && <Empty>조회된 업무가 없어요</Empty>}
      {filtered.slice(0, limit).map((t) => (
        <TaskRow key={t.id} task={t} />
      ))}
      {filtered.length > limit && (
        <p className="ln">
          <button className="btn-ghost" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            더 보기 ({filtered.length - limit})
          </button>
        </p>
      )}
      <p className="ln comment">// EOF</p>
    </div>
  );
}

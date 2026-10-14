import {
  addDays,
  dayOfWeek,
  DOW_LABEL,
  formatMinutes,
  layoutWeek,
  monthWeeks,
  shiftView,
  todayKst,
  viewRange,
  type CalendarEvent,
  type CalendarView,
  type DateStr,
  type EventKind,
  type Span,
  type Task,
  type WorkLog,
} from '@kingtepad/shared';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EventForm } from '../components/EventForm';
import { Markdown } from '../components/Markdown';
import { Empty, Pixel } from '../components/Pixel';
import { TaskRow } from '../components/TaskRow';
import { useApp } from '../lib/AppContext';
import { getTasksByIds, listEvents, listLogs, listTasks } from '../lib/db';
import { useAsync } from '../lib/useAsync';

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: 'month', label: '월' },
  { value: 'week', label: '주' },
  { value: 'day', label: '일' },
];
/** 월 보기에서 하루 칸에 보여 줄 최대 줄 수. 넘치면 +n */
const MONTH_LANES = 3;

type Layer = 'task' | EventKind;
const LAYERS: { value: Layer; label: string; key: string }[] = [
  { value: 'task', label: '업무', key: 'cal-key-task' },
  { value: 'personal', label: '개인 일정', key: 'ev-personal' },
  { value: 'work', label: '업무 일정', key: 'ev-work' },
];
const ALL_LAYERS = LAYERS.map((l) => l.value);

type Item = { type: 'task'; task: Task } | { type: 'event'; event: CalendarEvent };

const hhmm = (t: string | null) => t?.slice(0, 5) ?? '';
const isDate = (s: string | null): s is DateStr => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function Calendar() {
  const today = todayKst();
  const [params, setParams] = useSearchParams();
  const view = (VIEWS.find((v) => v.value === params.get('view'))?.value ?? 'month') as CalendarView;
  const date = isDate(params.get('date')) ? params.get('date')! : today;
  // 보여 줄 종류 필터. 파라미터가 없으면 전부
  const show = params.has('show') ? ALL_LAYERS.filter((l) => params.get('show')!.split(',').includes(l)) : ALL_LAYERS;
  const showKey = show.join(',');
  const showTasks = show.includes('task');
  const eventKinds = show.filter((l): l is EventKind => l !== 'task');

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v === null ? next.delete(k) : next.set(k, v);
    setParams(next);
  };
  const go = (v: CalendarView, d: DateStr) => update({ view: v, date: d });
  const toggleLayer = (layer: Layer) => {
    const next = show.includes(layer) ? show.filter((l) => l !== layer) : ALL_LAYERS.filter((l) => l === layer || show.includes(l));
    update({ show: next.length === ALL_LAYERS.length ? null : next.join(',') });
  };
  const { from, to } = viewRange(view, date);

  // 필터가 바뀌면 선택한 종류만 다시 불러온다
  const data = useAsync(async () => {
    const [tasks, events, logs] = await Promise.all([
      showTasks ? listTasks({ from, to }) : Promise.resolve([]),
      listEvents(from, to, eventKinds),
      listLogs({ from, to }),
    ]);
    // 일지·일정에 연결된 업무가 목록에 없으면(기간 밖, 필터로 숨김) 따로 불러와 제목을 보여 준다
    const known = new Set(tasks.map((t) => t.id));
    const linked = [...logs, ...events].flatMap((x) => (x.task_id && !known.has(x.task_id) ? [x.task_id] : []));
    const missing = [...new Set(linked)];
    const extra = await getTasksByIds(missing);
    return { tasks, events, logs, logTasks: [...tasks, ...extra] };
  }, [from, to, showKey]);

  const [form, setForm] = useState<{ event?: CalendarEvent; date?: DateStr } | null>(null);
  // 새 일정 기본 날짜: 보고 있는 기간에 오늘이 있으면 오늘, 아니면 보고 있는 날짜
  const addDate = view !== 'day' && from <= today && today <= to ? today : date;

  const title =
    view === 'month'
      ? `${date.slice(0, 4)}년 ${Number(date.slice(5, 7))}월`
      : view === 'week'
        ? `${from} ~ ${to.slice(5)}`
        : `${date} (${DOW_LABEL[dayOfWeek(date)]})`;

  const spans: Span<Item>[] = [
    ...(data.data?.tasks ?? []).map((task) => ({
      item: { type: 'task' as const, task },
      start: task.planned_start,
      end: task.planned_end,
    })),
    ...(data.data?.events ?? []).map((event) => ({
      item: { type: 'event' as const, event },
      start: event.start_date,
      end: event.end_date,
    })),
  ];
  const minutesByDay = new Map<DateStr, number>();
  for (const l of data.data?.logs ?? []) minutesByDay.set(l.log_date, (minutesByDay.get(l.log_date) ?? 0) + l.minutes);

  const weekProps = { spans, minutesByDay, onDay: (d: DateStr) => go('day', d), onEvent: (event: CalendarEvent) => setForm({ event }) };

  return (
    <div className="doc">
      <h1 className="ln h1">
        <span className="op"># </span>캘린더 <span className="num">{title}</span>
      </h1>

      <div className="ln cal-nav">
        <button className="btn-ghost" onClick={() => go(view, shiftView(view, date, -1))} aria-label="이전">
          ◀
        </button>
        <button className="btn-ghost" onClick={() => go(view, today)} disabled={date === today}>
          오늘
        </button>
        <button className="btn-ghost" onClick={() => go(view, shiftView(view, date, 1))} aria-label="다음">
          ▶
        </button>
        <span className="seg" role="tablist" aria-label="보기">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              role="tab"
              aria-selected={view === v.value}
              className={`seg-btn ${view === v.value ? 'active' : ''}`}
              onClick={() => go(v.value, date)}
            >
              {v.label}
            </button>
          ))}
        </span>
        <button className="btn-primary cal-add" onClick={() => setForm({ date: addDate })} title="일정 등록" aria-label="일정 등록">
          <Pixel name="plus" /> <span className="cal-add-text">일정 등록</span>
        </button>
      </div>
      <div className="ln cal-filter" role="group" aria-label="표시할 일정">
        <span className="comment">// 보기:</span>
        {LAYERS.map((l) => (
          <button
            key={l.value}
            className={`chip ${show.includes(l.value) ? 'on' : ''}`}
            aria-pressed={show.includes(l.value)}
            onClick={() => toggleLayer(l.value)}
          >
            <i className={`cal-key ${l.key}`} />
            {l.label}
          </button>
        ))}
      </div>
      {data.error && <p className="ln error">{data.error.message}</p>}

      {view === 'month' && (
        <div className="cal">
          <DowHeader />
          {monthWeeks(date).map((w) => (
            <WeekRow key={w} weekStart={w} maxLanes={MONTH_LANES} outside={(d) => d.slice(0, 7) !== date.slice(0, 7)} {...weekProps} />
          ))}
        </div>
      )}

      {view === 'week' && (
        <div className="cal cal-tall">
          <DowHeader weekStart={from} />
          <WeekRow weekStart={from} maxLanes={Infinity} {...weekProps} />
        </div>
      )}

      {view === 'day' && data.data && (
        <DayView
          date={date}
          tasks={data.data.tasks.filter((t) => t.planned_start <= date && t.planned_end >= date)}
          events={data.data.events}
          logs={data.data.logs.filter((l) => l.log_date === date)}
          logTasks={data.data.logTasks}
          showTasks={showTasks}
          showEvents={eventKinds.length > 0}
          onEvent={(event) => setForm({ event })}
          onAdd={() => setForm({ date })}
        />
      )}

      {form && <EventForm event={form.event} date={form.date} onClose={() => setForm(null)} />}
    </div>
  );
}

function DowHeader({ weekStart }: { weekStart?: DateStr }) {
  return (
    <div className="cal-dow">
      {DOW_LABEL.map((_, dow) => (
        <span key={dow} className={dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''}>
          {DOW_LABEL[dow]}
          {weekStart && <span className="num"> {addDays(weekStart, dow).slice(5)}</span>}
        </span>
      ))}
    </div>
  );
}

/** 한 주 줄: 날짜 칸 위에 기간 막대를 겹쳐 그린다 */
function WeekRow({
  weekStart,
  spans,
  maxLanes,
  minutesByDay,
  outside,
  onDay,
  onEvent,
}: {
  weekStart: DateStr;
  spans: Span<Item>[];
  maxLanes: number;
  minutesByDay: Map<DateStr, number>;
  outside?: (d: DateStr) => boolean;
  onDay: (d: DateStr) => void;
  onEvent: (e: CalendarEvent) => void;
}) {
  const { holidays, categoryById } = useApp();
  const navigate = useNavigate();
  const today = todayKst();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const placed = layoutWeek(weekStart, spans);
  const usedLanes = placed.reduce((m, p) => Math.max(m, p.lane + 1), 0);
  // 월 보기는 줄 높이를 고정해 달력 격자를 반듯하게 유지
  const lanes = Number.isFinite(maxLanes) ? maxLanes : Math.max(3, usedLanes);
  const hiddenByCol = days.map((_, col) => placed.filter((p) => p.lane >= lanes && p.col <= col && col < p.col + p.span).length);

  return (
    <div className="ln cal-week" style={{ gridTemplateRows: `var(--cal-head) repeat(${lanes}, var(--cal-bar)) var(--cal-foot)` }}>
      {days.map((d, i) => {
        const dow = dayOfWeek(d);
        const minutes = minutesByDay.get(d);
        const cls = [
          'cal-day',
          outside?.(d) && 'outside',
          d === today && 'today',
          (dow === 0 || holidays.has(d)) && 'sun',
          dow === 6 && !holidays.has(d) && 'sat',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <button key={d} className={cls} style={{ gridColumn: i + 1 }} onClick={() => onDay(d)} aria-label={`${d} 보기`}>
            <span className="cal-date">{Number(d.slice(8))}</span>
            {minutes ? <span className="cal-min">{formatMinutes(minutes)}</span> : null}
          </button>
        );
      })}

      {placed
        .filter((p) => p.lane < lanes)
        .map((p) => {
          const style = { gridColumn: `${p.col + 1} / span ${p.span}`, gridRow: p.lane + 2 };
          const edge = `${p.continuesBefore ? ' cont-l' : ''}${p.continuesAfter ? ' cont-r' : ''}`;
          if (p.item.type === 'task') {
            const t = p.item.task;
            const color = categoryById(t.category_id)?.color ?? '#94a3b8';
            return (
              <button
                key={`t-${t.id}`}
                className={`cal-bar cal-task${t.progress >= 100 ? ' done' : ''}${edge}`}
                style={{ ...style, ['--c' as string]: color }}
                onClick={() => navigate(`/tasks/${t.id}`)}
                title={`${t.title} (${t.planned_start} ~ ${t.planned_end}, ${t.progress}%)`}
              >
                {t.title}
              </button>
            );
          }
          const e = p.item.event;
          const time = e.start_time && !p.continuesBefore ? `${hhmm(e.start_time)} ` : '';
          return (
            <button
              key={`e-${e.id}`}
              className={`cal-bar ev-${e.kind}${edge}`}
              style={style}
              onClick={() => onEvent(e)}
              title={`${time}${e.title}`}
            >
              {time && <span className="num">{time}</span>}
              {e.title}
            </button>
          );
        })}

      {hiddenByCol.map((n, col) =>
        n ? (
          <button
            key={`more-${col}`}
            className="cal-more"
            style={{ gridColumn: col + 1, gridRow: lanes + 2 }}
            onClick={() => onDay(days[col]!)}
          >
            +{n}개
          </button>
        ) : null,
      )}
    </div>
  );
}

function DayView({
  date,
  tasks,
  events,
  logs,
  logTasks,
  showTasks,
  showEvents,
  onEvent,
  onAdd,
}: {
  date: DateStr;
  tasks: Task[];
  events: CalendarEvent[];
  logs: WorkLog[];
  logTasks: Task[];
  showTasks: boolean;
  showEvents: boolean;
  onEvent: (e: CalendarEvent) => void;
  onAdd: () => void;
}) {
  const { holidays } = useApp();
  const totalMinutes = logs.reduce((s, l) => s + l.minutes, 0);
  const taskTitle = (id: string) => logTasks.find((t) => t.id === id)?.title ?? '(삭제된 업무)';
  // 종일 일정 먼저, 나머지는 시작 시간 순
  const sorted = [...events].sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
  const dow = dayOfWeek(date);

  return (
    <>
      {(holidays.has(date) || dow === 0 || dow === 6) && (
        <p className="ln comment">// {holidays.has(date) ? '공휴일' : '주말'}이에요</p>
      )}

      {showEvents && (
        <h2 className="ln section">
          <span className="op">## </span>일정 <span className="num">({sorted.length})</span>
        </h2>
      )}
      {showEvents && sorted.length === 0 && (
        <div className="ln empty">
          <Pixel name="turtle" scale={2} />
          <button className="bubble" onClick={onAdd}>
            일정이 없어요. 등록할까요?
          </button>
        </div>
      )}
      {sorted.map((e) => (
        <button key={e.id} className="ln ev-line" onClick={() => onEvent(e)}>
          <span className="num ev-time">
            {e.start_time ? `${hhmm(e.start_time)}${e.end_time ? `~${hhmm(e.end_time)}` : ''}` : '종일'}
          </span>
          <span className={`badge ev-${e.kind}`}>{e.kind === 'work' ? '업무' : '개인'}</span>
          <span className="ev-title">{e.title}</span>
          {e.start_date !== e.end_date && (
            <span className="comment">
              {' '}
              // {e.start_date.slice(5)}~{e.end_date.slice(5)}
            </span>
          )}
          {e.task_id && <span className="kw"> → {taskTitle(e.task_id)}</span>}
          {e.memo && <span className="str ev-memo">{e.memo}</span>}
        </button>
      ))}

      {showTasks && (
        <>
          <h2 className="ln section">
            <span className="op">## </span>업무 <span className="num">({tasks.length})</span>
          </h2>
          {tasks.length === 0 ? <Empty>예정된 업무가 없어요</Empty> : tasks.map((t) => <TaskRow key={t.id} task={t} />)}
        </>
      )}

      <h2 className="ln section">
        <span className="op">## </span>일지 <span className="dur">{formatMinutes(totalMinutes)}</span>
      </h2>
      {logs.length === 0 && <Empty>이 날 기록이 없어요</Empty>}
      {logs.map((l) => (
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
    </>
  );
}

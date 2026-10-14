import { addDays, parseDate } from './dates';
import type { DateStr } from './types';

export type CalendarView = 'month' | 'week' | 'day';

export const DOW_LABEL = ['일', '월', '화', '수', '목', '금', '토'];

export function dayOfWeek(d: DateStr): number {
  return parseDate(d).getUTCDay();
}

/** 캘린더 한 주의 시작(일요일). 주간 보고서는 월요일 시작인 startOfWeek 를 쓴다 */
export function startOfCalendarWeek(d: DateStr): DateStr {
  return addDays(d, -dayOfWeek(d));
}

export function startOfMonth(d: DateStr): DateStr {
  return `${d.slice(0, 8)}01`;
}

/** n개월 이동. 말일이 없으면 그 달 말일로 맞춘다 (01-31 + 1개월 = 02-28) */
export function addMonths(d: DateStr, n: number): DateStr {
  const [y, m, day] = d.split('-').map(Number);
  const first = new Date(Date.UTC(y!, m! - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day!, last));
  return first.toISOString().slice(0, 10);
}

/** 월 달력에 보이는 주의 시작일(일요일) 목록. 앞뒤 달 날짜가 섞인 주도 포함 */
export function monthWeeks(d: DateStr): DateStr[] {
  const first = startOfMonth(d);
  const nextMonth = addMonths(first, 1);
  const weeks: DateStr[] = [];
  for (let w = startOfCalendarWeek(first); w < nextMonth; w = addDays(w, 7)) weeks.push(w);
  return weeks;
}

/** 화면에 보이는 기간 [from, to] */
export function viewRange(view: CalendarView, d: DateStr): { from: DateStr; to: DateStr } {
  if (view === 'day') return { from: d, to: d };
  if (view === 'week') {
    const from = startOfCalendarWeek(d);
    return { from, to: addDays(from, 6) };
  }
  const weeks = monthWeeks(d);
  return { from: weeks[0]!, to: addDays(weeks[weeks.length - 1]!, 6) };
}

export function shiftView(view: CalendarView, d: DateStr, dir: 1 | -1): DateStr {
  if (view === 'month') return addMonths(d, dir);
  return addDays(d, view === 'week' ? 7 * dir : dir);
}

export interface Span<T> {
  item: T;
  start: DateStr;
  end: DateStr;
}

export interface PlacedSpan<T> extends Span<T> {
  /** 주 안에서의 시작 칸 (0=일) */
  col: number;
  /** 차지하는 칸 수 */
  span: number;
  /** 세로 줄 번호 (0부터) */
  lane: number;
  /** 지난 주에서 이어짐 / 다음 주로 이어짐 */
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/**
 * 한 주(일~토)에 걸치는 기간 항목들을 겹치지 않게 줄(lane)에 배치한다.
 * 먼저 시작하는 것, 같으면 긴 것을 위쪽 줄에 둔다.
 */
export function layoutWeek<T>(weekStart: DateStr, spans: Span<T>[]): PlacedSpan<T>[] {
  const weekEnd = addDays(weekStart, 6);
  const colOf = (d: DateStr) => Math.round((parseDate(d).getTime() - parseDate(weekStart).getTime()) / 86_400_000);

  const visible = spans
    .filter((s) => s.start <= weekEnd && s.end >= weekStart)
    .sort((a, b) => (a.start === b.start ? (a.end < b.end ? 1 : a.end > b.end ? -1 : 0) : a.start < b.start ? -1 : 1));

  const laneEnds: number[] = []; // 줄마다 마지막으로 차지한 칸
  return visible.map((s) => {
    const col = Math.max(0, colOf(s.start));
    const endCol = Math.min(6, colOf(s.end));
    let lane = laneEnds.findIndex((e) => e < col);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = endCol;
    return {
      ...s,
      col,
      span: endCol - col + 1,
      lane,
      continuesBefore: s.start < weekStart,
      continuesAfter: s.end > weekEnd,
    };
  });
}

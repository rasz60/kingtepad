import { describe, expect, it } from 'vitest';
import { addMonths, layoutWeek, monthWeeks, startOfCalendarWeek, viewRange } from './index';

describe('addMonths', () => {
  it('말일이 없는 달은 말일로 맞춤', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-10', -1)).toBe('2025-12-10');
  });
});

describe('startOfCalendarWeek', () => {
  it('일요일 시작', () => {
    expect(startOfCalendarWeek('2026-10-14')).toBe('2026-10-11');
    expect(startOfCalendarWeek('2026-10-11')).toBe('2026-10-11');
    expect(startOfCalendarWeek('2026-10-17')).toBe('2026-10-11');
  });
});

describe('monthWeeks', () => {
  it('2026년 10월: 9/27(일) 주부터 10/25 주까지 5주', () => {
    expect(monthWeeks('2026-10-14')).toEqual(['2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25']);
  });

  it('일요일 1일로 시작하는 달은 앞 달 주를 넣지 않음', () => {
    expect(monthWeeks('2026-11-20')[0]).toBe('2026-11-01');
  });
});

describe('viewRange', () => {
  it('주/월 보기 범위', () => {
    expect(viewRange('week', '2026-10-14')).toEqual({ from: '2026-10-11', to: '2026-10-17' });
    expect(viewRange('month', '2026-10-14')).toEqual({ from: '2026-09-27', to: '2026-10-31' });
  });
});

describe('layoutWeek', () => {
  const week = '2026-10-11';

  it('겹치는 항목은 다른 줄, 안 겹치면 같은 줄', () => {
    const placed = layoutWeek(week, [
      { item: 'a', start: '2026-10-11', end: '2026-10-13' },
      { item: 'b', start: '2026-10-12', end: '2026-10-12' },
      { item: 'c', start: '2026-10-14', end: '2026-10-15' },
    ]);
    const lane = Object.fromEntries(placed.map((p) => [p.item, p.lane]));
    expect(lane).toEqual({ a: 0, b: 1, c: 0 });
  });

  it('주 경계를 넘는 항목은 잘라서 이어짐 표시', () => {
    const [p] = layoutWeek(week, [{ item: 'x', start: '2026-10-09', end: '2026-10-20' }]);
    expect(p).toMatchObject({ col: 0, span: 7, continuesBefore: true, continuesAfter: true });
  });

  it('주에 걸치지 않는 항목은 제외', () => {
    expect(layoutWeek(week, [{ item: 'x', start: '2026-10-18', end: '2026-10-19' }])).toEqual([]);
  });
});

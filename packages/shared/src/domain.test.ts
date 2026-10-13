import { describe, expect, it } from 'vitest';
import {
  countWorkdays,
  expectedProgress,
  parseQuickEntry,
  startOfWeek,
  taskStatus,
  todayKst,
} from './index';

const holidays = new Set(['2026-10-09']); // 한글날(금)

describe('todayKst', () => {
  it('UTC 자정 직후(KST 오전)에도 한국 날짜를 반환', () => {
    expect(todayKst(new Date('2026-10-12T23:30:00Z'))).toBe('2026-10-13');
  });
});

describe('countWorkdays', () => {
  it('주말과 공휴일 제외', () => {
    // 10/5(월) ~ 10/11(일): 월~목 4일, 금은 한글날
    expect(countWorkdays('2026-10-05', '2026-10-11', holidays)).toBe(4);
  });
});

describe('startOfWeek', () => {
  it('일요일은 직전 월요일', () => {
    expect(startOfWeek('2026-10-18')).toBe('2026-10-12');
    expect(startOfWeek('2026-10-12')).toBe('2026-10-12');
  });
});

describe('expectedProgress / taskStatus', () => {
  const base = { planned_start: '2026-10-12', planned_end: '2026-10-16', deleted_at: null };

  it('시작 전이면 예정', () => {
    expect(expectedProgress(base.planned_start, base.planned_end, '2026-10-11', holidays)).toBeNull();
    expect(taskStatus({ ...base, progress: 0 }, '2026-10-11', holidays)).toBe('planned');
  });

  it('영업일 비율로 기대치 계산 (5일 중 2일 경과 = 40%)', () => {
    expect(expectedProgress(base.planned_start, base.planned_end, '2026-10-13', holidays)).toBe(40);
    expect(taskStatus({ ...base, progress: 30 }, '2026-10-13', holidays)).toBe('delayed');
    expect(taskStatus({ ...base, progress: 40 }, '2026-10-13', holidays)).toBe('in_progress');
  });

  it('완료/삭제 우선', () => {
    expect(taskStatus({ ...base, progress: 100 }, '2026-10-20', holidays)).toBe('done');
    expect(taskStatus({ ...base, progress: 100, deleted_at: 'x' }, '2026-10-13', holidays)).toBe('deleted');
  });
});

describe('parseQuickEntry', () => {
  it('카테고리·시간·진척률 추출', () => {
    expect(parseQuickEntry('#개발 로그인 API 수정 1h30m 60%')).toEqual({
      category: '개발',
      text: '로그인 API 수정',
      minutes: 90,
      progress: 60,
    });
  });

  it('소수 시간, 표기 없는 경우', () => {
    expect(parseQuickEntry('회의록 정리 1.5h')).toMatchObject({ category: null, minutes: 90, progress: null });
    expect(parseQuickEntry('그냥 메모')).toEqual({ category: null, text: '그냥 메모', minutes: 0, progress: null });
  });

  it('단어 중간의 숫자는 시간으로 보지 않음', () => {
    expect(parseQuickEntry('v2m 배포 30m').text).toBe('v2m 배포');
  });
});

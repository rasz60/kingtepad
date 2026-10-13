import { addDays, parseDate } from './dates';
import type { DateStr } from './types';

export type HolidaySet = ReadonlySet<DateStr>;

export function isWorkday(d: DateStr, holidays: HolidaySet): boolean {
  const dow = parseDate(d).getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.has(d);
}

/** start~end (양 끝 포함) 영업일 수 */
export function countWorkdays(start: DateStr, end: DateStr, holidays: HolidaySet): number {
  if (start > end) return 0;
  let count = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (isWorkday(d, holidays)) count++;
  }
  return count;
}

/** 하루 8시간 = 1MD, 20MD = 1MM */
export const MINUTES_PER_MD = 8 * 60;
export const MD_PER_MM = 20;

export function minutesToMD(minutes: number): number {
  return Math.round((minutes / MINUTES_PER_MD) * 10) / 10;
}

export function minutesToMM(minutes: number): number {
  return Math.round((minutes / MINUTES_PER_MD / MD_PER_MM) * 100) / 100;
}

import type { DateStr } from './types';

const KST_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 한국 시간 기준 날짜 문자열. toISOString()은 UTC라 오전 9시 전에는 어제가 나온다. */
export function todayKst(now: Date = new Date()): DateStr {
  return KST_FORMAT.format(now);
}

/** 'YYYY-MM-DD' → 해당 날짜 UTC 자정 (요일·일수 계산 전용) */
export function parseDate(d: DateStr): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!));
}

export function formatDate(d: Date): DateStr {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: DateStr, n: number): DateStr {
  const date = parseDate(d);
  date.setUTCDate(date.getUTCDate() + n);
  return formatDate(date);
}

/** 해당 날짜가 속한 주의 월요일 */
export function startOfWeek(d: DateStr): DateStr {
  const dow = parseDate(d).getUTCDay(); // 0=일
  return addDays(d, dow === 0 ? -6 : 1 - dow);
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
}

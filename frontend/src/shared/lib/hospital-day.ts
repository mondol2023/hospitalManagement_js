import type { ISODateString } from '@/shared/types/domain';

/**
 * The one clock the operations screens agree on.
 *
 * "Today's arrivals", "expired" and "overdue" all hinge on what day it is. If
 * each page worked that out for itself, the front desk and the dashboard could
 * disagree about which visits are today's, and a batch could read as expired on
 * one screen and as expiring on the next. Everything goes through here.
 *
 * It uses the browser's local time. If the hospital's timezone ever differs
 * from the desk's (open item O2 in the 4d spec), the fix is this one file.
 */

export interface DateRange {
  from: ISODateString;
  to: ISODateString;
}

/**
 * Local midnight to the last millisecond of the local day, as ISO strings.
 *
 * The end is inclusive on purpose: the server filters `scheduledAt <= to`, so
 * sending tomorrow's midnight would pull a 00:00 visit into today's list.
 */
export function todayRange(now: Date = new Date()): DateRange {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

function endOfLocalDay(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 23, 59, 59, 999);
}

/**
 * The window "last N days" means: local midnight N days back, through the end of
 * today. Today is included, so "30 days" on 22 Nov reads "23 Oct – 22 Nov" and
 * the day's takings so far are counted.
 *
 * The result depends only on the calendar day, never the time of day, so it can
 * sit in a query key without the key changing every minute.
 */
export function lastDaysRange(days: number, now: Date = new Date()): DateRange {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 0, 0, 0, 0);
  const end = endOfLocalDay(now.getFullYear(), now.getMonth(), now.getDate());
  return { from: start.toISOString(), to: end.toISOString() };
}

/** `2026-11-22` → the local day it names, or `null` if it is not a real date. */
function parseDay(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  // `new Date(2026, 1, 31)` quietly becomes 3 March; a round trip catches that.
  const check = new Date(year, month, day);
  const real =
    check.getFullYear() === year && check.getMonth() === month && check.getDate() === day;
  return real ? { year, month, day } : null;
}

/**
 * Two calendar days, as typed into date inputs, as a window: the start day's
 * midnight through the end of the last day. A single day is a valid window.
 * Returns `null` for anything the server would refuse (not a date, or a start
 * after the end), so the caller never sends a request it knows will fail.
 */
export function customDayRange(fromDay: string, toDay: string): DateRange | null {
  const first = parseDay(fromDay);
  const last = parseDay(toDay);
  if (!first || !last) return null;

  const start = new Date(first.year, first.month, first.day, 0, 0, 0, 0);
  const end = endOfLocalDay(last.year, last.month, last.day);
  if (start.getTime() >= end.getTime()) return null;
  return { from: start.toISOString(), to: end.toISOString() };
}

/**
 * Whether `date` is at or before `now`. The instant itself counts as past,
 * matching the server's sweep (`expiryDate <= now`): the expiry list and the
 * write-off must agree on which batches are expired.
 *
 * A missing or unparsable date is never "past" — an unknown expiry must not be
 * shown as an expired one.
 */
export function isPast(date: string | Date | null | undefined, now: Date = new Date()): boolean {
  if (date == null) return false;
  const time = (date instanceof Date ? date : new Date(date)).getTime();
  return Number.isFinite(time) && time <= now.getTime();
}

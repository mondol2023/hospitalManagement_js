/**
 * Display formatting, in one place so a date never renders three different
 * ways on three screens.
 *
 * Deliberately built on `Intl`, not a date library: everything the app needs
 * (a date, a time, a relative "3m ago") is one `Intl` call, and the bundle
 * cost of a date library buys nothing here.
 */

const dateFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

const relativeFmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  return date ? dateFmt.format(date) : fallback;
}

export function formatDateTime(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  return date ? dateTimeFmt.format(date) : fallback;
}

export function formatTime(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  return date ? timeFmt.format(date) : fallback;
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
  ['second', 1000],
];

export function formatRelative(value: string | Date | null | undefined, now = Date.now()): string {
  const date = toDate(value);
  if (!date) return '—';

  const diff = date.getTime() - now;
  const abs = Math.abs(diff);
  if (abs < 45_000) return 'just now';

  for (const [unit, ms] of RELATIVE_UNITS) {
    if (abs >= ms) return relativeFmt.format(Math.round(diff / ms), unit);
  }
  return 'just now';
}

/** `2026-08-07` — the format every date input and date query param expects. */
export function toDateInputValue(value: string | Date | null | undefined): string {
  const date = toDate(value) ?? new Date();
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** `partially_paid` → `Partially paid`. Used for every backend enum shown to a user. */
export function humanizeEnum(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** What the page keeps in its URL, and how a hand-edited URL is read back. */

export const DEFAULT_DAYS = 30;
export const DAY_PRESETS = [7, 30, 90] as const;
export const MIN_DAYS = 1;
export const MAX_DAYS = 365;

export type ReportTab = 'stock' | 'movements';

export function isValidDays(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_DAYS && value <= MAX_DAYS;
}

/** Digits only: `Number('1e2')` and `Number(' 7')` would otherwise slip through. */
export function parseDays(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw)) return DEFAULT_DAYS;
  const value = Number(raw);
  return isValidDays(value) ? value : DEFAULT_DAYS;
}

export function parseTab(raw: string | null): ReportTab {
  return raw === 'movements' ? 'movements' : 'stock';
}

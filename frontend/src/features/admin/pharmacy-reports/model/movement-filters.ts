import type { MovementParams, StockMovementKind } from '../api/reports-api';
import { parseKind } from './movement-kinds';

/**
 * The Movements tab's filters as the URL holds them. A day is `YYYY-MM-DD`,
 * what a date input produces; it becomes an instant only at the request edge.
 */
export interface MovementFilters {
  kind: StockMovementKind | null;
  /** A medicine batch id. */
  medicine: string | null;
  /** The person who made the change. */
  actor: string | null;
  from: string | null;
  to: string | null;
  page: number;
}

export const EMPTY_FILTERS: MovementFilters = {
  kind: null,
  medicine: null,
  actor: null,
  from: null,
  to: null,
  page: 1,
};

export const MOVEMENTS_PAGE_SIZE = 25;
export const NEWEST_FIRST = '-createdAt';
export const RANGE_ERROR = 'End date must be on or after the start date.';

const OBJECT_ID = /^[a-f\d]{24}$/i;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseId(raw: string | null): string | null {
  return raw !== null && OBJECT_ID.test(raw) ? raw : null;
}

/** A real calendar day, so `2026-02-30` is nothing rather than March the 2nd. */
function parseDay(raw: string | null): string | null {
  const match = raw === null ? null : DAY.exec(raw);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  const real =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return real ? raw : null;
}

function parsePage(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw)) return 1;
  return Math.max(Number(raw), 1);
}

export function parseMovementFilters(params: URLSearchParams): MovementFilters {
  return {
    kind: parseKind(params.get('kind')),
    medicine: parseId(params.get('medicine')),
    actor: parseId(params.get('actor')),
    from: parseDay(params.get('from')),
    to: parseDay(params.get('to')),
    page: parsePage(params.get('page')),
  };
}

/** The tab, then each filter that is set. The page is written only past the first. */
export function writeMovementFilters(filters: MovementFilters): URLSearchParams {
  const params = new URLSearchParams({ tab: 'movements' });
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.medicine) params.set('medicine', filters.medicine);
  if (filters.actor) params.set('actor', filters.actor);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params;
}

/** The page is not a filter: page 3 of everything is still "no filters". */
export function hasActiveFilters(filters: MovementFilters): boolean {
  return Boolean(filters.kind || filters.medicine || filters.actor || filters.from || filters.to);
}

function startOfDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, date, 0, 0, 0, 0).toISOString();
}

/** `to` is an inclusive instant on the server, so the chosen day has to run to its last millisecond. */
function endOfDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, date, 23, 59, 59, 999).toISOString();
}

export interface MovementRequest {
  /** Null when the range runs backwards: nothing is sent. */
  params: MovementParams | null;
  rangeError: string | null;
}

export function movementRequest(filters: MovementFilters): MovementRequest {
  // `YYYY-MM-DD` sorts as text the way it sorts as dates.
  if (filters.from && filters.to && filters.from > filters.to) {
    return { params: null, rangeError: RANGE_ERROR };
  }

  const params: MovementParams = {
    page: filters.page,
    limit: MOVEMENTS_PAGE_SIZE,
    sort: NEWEST_FIRST,
  };
  if (filters.kind) params.kind = filters.kind;
  if (filters.medicine) params.medicine = filters.medicine;
  if (filters.actor) params.actor = filters.actor;
  if (filters.from) params.from = startOfDay(filters.from);
  if (filters.to) params.to = endOfDay(filters.to);
  return { params, rangeError: null };
}

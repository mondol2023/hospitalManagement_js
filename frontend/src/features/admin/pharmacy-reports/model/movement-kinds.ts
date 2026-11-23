import type { MedicineUnit } from '@/shared/types/domain';

import { STOCK_MOVEMENT_KINDS, type StockMovementKind } from '../api/reports-api';

/** What each kind is called on screen. The server's words ("withdrawn") are not the staff's. */
export const KIND_LABEL: Record<StockMovementKind, string> = {
  restock: 'Restock',
  dispense: 'Dispensed',
  adjust: 'Adjusted',
  administered: 'Given to patient',
  restored: 'Returned to stock',
  withdrawn: 'Written off',
};

/** A kind read from a URL or a form: the known ones pass, anything else is nothing. */
export function parseKind(raw: string | null): StockMovementKind | null {
  return STOCK_MOVEMENT_KINDS.find((kind) => kind === raw) ?? null;
}

/** Measures are written the same whatever the amount; countable units take an s. */
const MEASURES: ReadonlySet<MedicineUnit> = new Set(['ml', 'mg']);

function withUnit(count: number, unit: MedicineUnit): string {
  if (MEASURES.has(unit)) return `${count} ${unit}`;
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/** `+120 tablets` / `−4 ml`. The sign is always written, so colour is never the only cue. */
export function formatChange(delta: number, unit: MedicineUnit): string {
  if (delta === 0) return withUnit(0, unit);
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${withUnit(Math.abs(delta), unit)}`;
}

/** The balance after a movement: `60 tablets`. */
export function formatOnHand(onHand: number, unit: MedicineUnit): string {
  return withUnit(onHand, unit);
}

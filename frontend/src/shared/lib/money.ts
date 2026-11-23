import type { Cents } from '@/shared/types/domain';

/**
 * Money, in integer minor units, everywhere.
 *
 * The backend stores and returns cents (`Bill.totalCents`), and this file is
 * the only place the app is allowed to cross between that and a human-readable
 * string. The reason is the usual one, and it is not theoretical: `0.1 + 0.2`
 * is `0.30000000000000004`, so a bill built by summing float dollars can be a
 * cent off, and a cent off on an invoice is a reconciliation ticket.
 *
 * The rule this file enforces: arithmetic happens on integers, and formatting
 * happens once, at the edge, on the way to a DOM node.
 */

const FORMATTERS = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
  const key = currency.toUpperCase();
  let formatter = FORMATTERS.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: key,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    FORMATTERS.set(key, formatter);
  }
  return formatter;
}

export function formatMoney(cents: Cents | null | undefined, currency = 'USD'): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return formatterFor(currency).format(cents / 100);
}

/** Bare number, no symbol — for table cells that carry the currency in the header. */
export function formatAmount(cents: Cents | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return (cents / 100).toFixed(2);
}

/**
 * Parses what a user typed into cents. Accepts `12`, `12.5`, `12.50`, `$12.50`
 * and `1,250.00`; rejects anything else by returning `null` rather than `NaN`,
 * so a call site cannot accidentally submit a broken amount.
 *
 * Rounds rather than truncates: someone typing `10.005` means one cent more,
 * not one cent less, and truncation systematically favours the hospital.
 */
export function parseMoneyToCents(input: string): Cents | null {
  const cleaned = input.replace(/[\s,$]/g, '');
  if (cleaned === '' || !/^-?\d*\.?\d*$/.test(cleaned)) return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** A typed major-unit amount (`"12.50"`) to cents, or `null` if it is not an amount. Same rules as `parseMoneyToCents`. */
export const toCents = parseMoneyToCents;

/** Cents to the major-unit string a money input shows. Same as `centsToInputValue`. */
export const fromCents = (cents: Cents): string => centsToInputValue(cents);

/** `1250` cents → `"12.50"`, the value a `<input type="number" step="0.01">` wants. */
export function centsToInputValue(cents: Cents): string {
  return (cents / 100).toFixed(2);
}

/**
 * Line total. Kept here rather than inline in the bill form so the client's
 * preview and the server's authoritative calculation round the same way — the
 * preview is a courtesy, and a preview that disagrees with the invoice is
 * worse than no preview.
 */
export function lineAmountCents(quantity: number, unitPriceCents: Cents): Cents {
  return Math.round(quantity * unitPriceCents);
}

export interface BillTotals {
  subtotalCents: Cents;
  taxCents: Cents;
  discountCents: Cents;
  totalCents: Cents;
}

/**
 * Client-side echo of `billingService.computeTotals`. Discount is applied
 * before tax, and the total is floored at zero so a discount larger than the
 * subtotal shows `0.00` rather than a negative invoice.
 */
export function computeTotals(
  items: Array<{ quantity: number; unitPriceCents: Cents }>,
  { taxRate = 0, discountCents = 0 }: { taxRate?: number; discountCents?: Cents } = {}
): BillTotals {
  const subtotalCents = items.reduce(
    (sum, item) => sum + lineAmountCents(item.quantity, item.unitPriceCents),
    0
  );
  const discounted = Math.max(0, subtotalCents - discountCents);
  const taxCents = Math.round(discounted * taxRate);

  return {
    subtotalCents,
    taxCents,
    discountCents: Math.min(discountCents, subtotalCents),
    totalCents: discounted + taxCents,
  };
}

export function balanceCents(bill: { totalCents: Cents; paidCents: Cents }): Cents {
  return Math.max(0, bill.totalCents - bill.paidCents);
}

/** `0`–`1`, clamped. Drives the paid-progress bar on the invoice screen. */
export function paidFraction(bill: { totalCents: Cents; paidCents: Cents }): number {
  if (bill.totalCents <= 0) return 0;
  return Math.min(1, Math.max(0, bill.paidCents / bill.totalCents));
}

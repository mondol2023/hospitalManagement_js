import { describe, expect, it } from 'vitest';

import { balanceCents, formatMoney } from './money';

describe('formatMoney', () => {
  it('shows integer cents as a two-decimal amount', () => {
    expect(formatMoney(4821000, 'USD')).toBe('$48,210.00');
  });

  it('shows zero as an amount, not as a missing value', () => {
    expect(formatMoney(0, 'USD')).toBe('$0.00');
  });

  it('keeps a cent exactly, with no float drift', () => {
    expect(formatMoney(1, 'USD')).toBe('$0.01');
    expect(formatMoney(10, 'USD')).toBe('$0.10');
    expect(formatMoney(30, 'USD')).toBe('$0.30');
  });

  // Refund rows carry negative cents; the sign has to survive formatting.
  it('keeps the sign of a negative amount', () => {
    expect(formatMoney(-12550, 'USD')).toMatch(/^-\$125\.50$|^\(\$125\.50\)$|^-\s?\$125\.50$/);
  });

  it('formats each bill in its own currency', () => {
    expect(formatMoney(12500, 'EUR')).toContain('125.00');
    expect(formatMoney(12500, 'EUR')).not.toContain('$');
  });

  it('renders a dash for null, undefined and non-finite values', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoney(Number.NaN)).toBe('—');
  });
});

describe('balanceCents', () => {
  // `balanceCents` is a virtual on the model and is lost under `lean`, so the
  // outstanding table computes it from these two fields.
  it('is what is still owed', () => {
    expect(balanceCents({ totalCents: 42000, paidCents: 10000 })).toBe(32000);
  });

  it('never goes negative on an overpaid bill', () => {
    expect(balanceCents({ totalCents: 1000, paidCents: 1500 })).toBe(0);
  });
});

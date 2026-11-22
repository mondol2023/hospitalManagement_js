import { describe, expect, it } from 'vitest';

import { bill } from '../test-fixtures';
import { billStatusWord, dueLine, owedCents } from './bills';

const NOW = new Date(2026, 10, 22, 12, 0);

describe('billStatusWord', () => {
  it.each([
    ['unpaid', 'To pay'],
    ['partially_paid', 'Part paid'],
    ['paid', 'Paid'],
    ['void', 'Cancelled'],
  ] as const)('says %s as "%s"', (status, word) => {
    expect(billStatusWord(status).label).toBe(word);
  });

  it('never colours a bill red, however much is owed', () => {
    for (const status of ['unpaid', 'partially_paid', 'paid', 'void'] as const) {
      expect(billStatusWord(status).tone).not.toBe('danger');
    }
  });
});

describe('owedCents', () => {
  it('is the total less what has been paid', () => {
    expect(owedCents(bill('a', 10_000, 2_500))).toBe(7_500);
  });

  it('is nothing for a paid bill', () => {
    expect(owedCents(bill('a', 10_000, 10_000, { status: 'paid' }))).toBe(0);
  });

  it('is nothing for a cancelled bill, whatever its total says', () => {
    expect(owedCents(bill('a', 10_000, 0, { status: 'void' }))).toBe(0);
  });

  it('never goes below nothing when more was paid than the total', () => {
    expect(owedCents(bill('a', 10_000, 12_000))).toBe(0);
  });
});

describe('dueLine', () => {
  it('says when a bill is due', () => {
    const due = new Date(2026, 10, 30).toISOString();

    expect(dueLine(bill('a', 100, 0, { dueDate: due }), NOW)).toMatch(/^Due 30 Nov|^Due Nov 30/);
  });

  it('adds "overdue", in words, once the date has passed and money is still owed', () => {
    const due = new Date(2026, 10, 2).toISOString();

    expect(dueLine(bill('a', 100, 0, { dueDate: due }), NOW)).toMatch(/, overdue$/);
  });

  it('does not call a paid bill overdue', () => {
    const due = new Date(2026, 10, 2).toISOString();

    expect(dueLine(bill('a', 100, 100, { status: 'paid', dueDate: due }), NOW)).toBeNull();
  });

  it('does not call a cancelled bill overdue', () => {
    const due = new Date(2026, 10, 2).toISOString();

    expect(dueLine(bill('a', 100, 0, { status: 'void', dueDate: due }), NOW)).toBeNull();
  });

  it('is empty when the desk set no due date', () => {
    expect(dueLine(bill('a', 100, 0), NOW)).toBeNull();
  });

  it('counts the whole of the due day as not yet overdue', () => {
    const dueToday = new Date(2026, 10, 22, 0, 0).toISOString();

    expect(dueLine(bill('a', 100, 0, { dueDate: dueToday }), NOW)).not.toMatch(/overdue/);
  });
});

import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { formatDate } from '@/shared/lib/format';
import { formatMoney } from '@/shared/lib/money';
import { renderWithProviders } from '@/test/render';

import { outstandingBill } from '../test-fixtures';
import { OutstandingTable } from './OutstandingTable';

// 16:12 in the pinned test timezone (Asia/Dhaka, UTC+6).
const NOW = new Date('2026-11-22T10:12:00.000Z');

function renderTable(bills = [outstandingBill('0412', 'Amina Yusuf')]) {
  return renderWithProviders(<OutstandingTable bills={bills} now={NOW} />);
}

function firstRow() {
  return screen.getAllByRole('listitem')[0] as HTMLElement;
}

describe('OutstandingTable', () => {
  it('names the patient, with the MRN and invoice number set as identifiers', () => {
    renderTable();
    const row = firstRow();

    expect(within(row).getByText('Amina Yusuf')).toBeInTheDocument();
    expect(within(row).getByText('MRN-0412')).toHaveClass('font-mono');
    expect(within(row).getByText('INV-2026-0412')).toHaveClass('font-mono');
  });

  it('links the invoice to that patient’s ledger on the billing page', () => {
    renderTable();

    expect(screen.getByRole('link', { name: /INV-2026-0412/ })).toHaveAttribute(
      'href',
      '/app/billing?patient=p-0412'
    );
  });

  // `balanceCents` is a model virtual and does not survive the lean read.
  it('works the balance out as total minus paid', () => {
    renderTable([
      outstandingBill('0412', 'Amina Yusuf', { totalCents: 50_000, paidCents: 12_500, status: 'partially_paid' }),
    ]);

    expect(within(firstRow()).getByText(formatMoney(37_500))).toBeInTheDocument();
  });

  it('formats each row in its own currency', () => {
    renderTable([
      outstandingBill('a', 'Amina Yusuf', { currency: 'USD' }),
      outstandingBill('b', 'Jon Okafor', { currency: 'EUR' }),
    ]);
    const [usd, eur] = screen.getAllByRole('listitem') as [HTMLElement, HTMLElement];

    expect(within(usd).getByText(formatMoney(50_000, 'USD'))).toBeInTheDocument();
    expect(within(eur).getByText(formatMoney(50_000, 'EUR'))).toBeInTheDocument();
  });

  describe('status word', () => {
    it('says Overdue when the due date has passed', () => {
      renderTable([outstandingBill('a', 'Amina Yusuf', { dueDate: '2026-10-03T00:00:00.000Z' })]);
      const row = firstRow();

      expect(within(row).getByText('Overdue')).toBeInTheDocument();
      expect(within(row).getByText(formatDate('2026-10-03T00:00:00.000Z'))).toBeInTheDocument();
    });

    it('says Unpaid, or Part paid, while the bill is not yet due', () => {
      renderTable([
        outstandingBill('a', 'Amina Yusuf', { status: 'unpaid' }),
        outstandingBill('b', 'Jon Okafor', { status: 'partially_paid', paidCents: 100 }),
      ]);
      const [unpaid, part] = screen.getAllByRole('listitem') as [HTMLElement, HTMLElement];

      expect(within(unpaid).getByText('Unpaid')).toBeInTheDocument();
      expect(within(part).getByText('Part paid')).toBeInTheDocument();
      expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
    });

    it('prefers Overdue to Part paid, since overdue is what someone must act on', () => {
      renderTable([
        outstandingBill('a', 'Amina Yusuf', {
          status: 'partially_paid',
          paidCents: 100,
          dueDate: '2026-11-01T00:00:00.000Z',
        }),
      ]);

      expect(within(firstRow()).getByText('Overdue')).toBeInTheDocument();
      expect(within(firstRow()).queryByText('Part paid')).not.toBeInTheDocument();
    });

    it('treats a bill due later today as not yet overdue', () => {
      renderTable([outstandingBill('a', 'Amina Yusuf', { dueDate: '2026-11-22T17:59:59.000Z' })]);

      expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
    });

    // Money is never red (spec D4). The bill status map paints "unpaid" danger;
    // this table must not borrow it.
    it('never uses the danger colour for money', () => {
      renderTable([
        outstandingBill('a', 'Amina Yusuf', { dueDate: '2026-10-03T00:00:00.000Z' }),
        outstandingBill('b', 'Jon Okafor'),
        outstandingBill('c', 'Mei Tan', { status: 'partially_paid', paidCents: 100 }),
      ]);

      for (const row of screen.getAllByRole('listitem')) {
        expect(row.innerHTML).not.toMatch(/danger/);
      }
    });
  });

  it('says there is no due date rather than leaving the cell blank', () => {
    renderTable([outstandingBill('a', 'Amina Yusuf', { dueDate: undefined })]);

    expect(within(firstRow()).getByText('No due date')).toBeInTheDocument();
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
  });

  it('shows a placeholder, and still links, when the patient has no user record', () => {
    renderTable([outstandingBill('a', null)]);
    const row = firstRow();

    expect(within(row).getByText('Name not on record')).toBeInTheDocument();
    expect(within(row).getByText('MRN-A')).toBeInTheDocument();
    expect(within(row).getByRole('link')).toHaveAttribute('href', '/app/billing?patient=p-a');
  });

  it('falls back to the whole ledger when the bill has no patient at all', () => {
    renderTable([outstandingBill('a', 'Amina Yusuf', { patient: null })]);

    expect(within(firstRow()).getByRole('link')).toHaveAttribute('href', '/app/billing');
    expect(within(firstRow()).getByText('Name not on record')).toBeInTheDocument();
  });

  it('truncates a long name but keeps the full text on hover', () => {
    const long = 'Bartholomew Maximilian Featherstonehaugh-Cholmondeley';
    renderTable([outstandingBill('a', long)]);

    const name = within(firstRow()).getByText(long);
    expect(name).toHaveClass('truncate');
    expect(name).toHaveAttribute('title', long);
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api/envelope';
import { api } from '@/shared/api/client';
import { renderWithProviders } from '@/test/render';

import type { ActorRef, StockReport } from '../api/reports-api';
import { PharmacyReportsPage } from './PharmacyReportsPage';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), page: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

const asha: ActorRef = { id: 'u1', name: 'Asha Rao', role: 'pharmacist' };
const boss: ActorRef = { id: 'u2', name: 'Dev Patel', role: 'admin' };

function medicine(over: Record<string, unknown>) {
  return {
    id: 'm',
    name: 'Med',
    batchNumber: 'B-1',
    quantity: 10,
    unit: 'tablet',
    reorderLevel: 20,
    price: 1,
    expiryDate: '2027-01-01T00:00:00.000Z',
    requiresPrescription: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastRestock: null,
    ...over,
  };
}

function report(over: Partial<StockReport> = {}): StockReport {
  return {
    window: { from: '2026-10-24T00:00:00.000Z', to: '2026-11-23T00:00:00.000Z', days: 30 },
    alertRecipients: [asha, boss],
    lowStock: [],
    restockedBy: [],
    ...over,
  } as StockReport;
}

function mockReport(value: StockReport) {
  vi.mocked(api.get).mockResolvedValue(value);
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.page).mockReset();
});

describe('PharmacyReportsPage — stock report tab', () => {
  it('shows the title, both tabs, and the stock report selected by default', async () => {
    mockReport(report());
    renderWithProviders(<PharmacyReportsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Pharmacy reports' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Stock report' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Movements' })).toHaveAttribute('aria-selected', 'false');
    await screen.findByRole('heading', { name: 'Low stock right now' });
  });

  it('asks for the default 30-day window', async () => {
    mockReport(report());
    renderWithProviders(<PharmacyReportsPage />);

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/medicines/stock-report', { params: { days: 30 } })
    );
  });

  it('lists the emptiest shelf first, with the Low pill, units and reorder level', async () => {
    mockReport(
      report({
        lowStock: [
          medicine({ id: 'm1', name: 'Paracetamol', batchNumber: 'P-9', quantity: 15, reorderLevel: 20 }),
          medicine({ id: 'm2', name: 'Amoxicillin', batchNumber: 'A-2', quantity: 2, reorderLevel: 20, unit: 'capsule' }),
        ] as StockReport['lowStock'],
      })
    );
    renderWithProviders(<PharmacyReportsPage />);

    const table = await screen.findByRole('table', { name: 'Low stock' });
    const rows = within(table).getAllByRole('row').slice(1);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Amoxicillin');
    expect(rows[0]).toHaveTextContent('A-2');
    expect(rows[0]).toHaveTextContent('2 capsule');
    expect(rows[0]).toHaveTextContent('Low');
    expect(rows[1]).toHaveTextContent('Paracetamol');
  });

  it('says who last restocked a batch, and says so when nobody has', async () => {
    mockReport(
      report({
        lowStock: [
          medicine({
            id: 'm1',
            name: 'Paracetamol',
            quantity: 1,
            lastRestock: { at: new Date(Date.now() - 3_600_000).toISOString(), quantity: 50, by: asha },
          }),
          medicine({ id: 'm2', name: 'Amoxicillin', quantity: 5, lastRestock: null }),
          medicine({
            id: 'm3',
            name: 'Ibuprofen',
            quantity: 8,
            lastRestock: { at: new Date(Date.now() - 3_600_000).toISOString(), quantity: 10, by: null },
          }),
        ] as StockReport['lowStock'],
      })
    );
    renderWithProviders(<PharmacyReportsPage />);

    const table = await screen.findByRole('table', { name: 'Low stock' });
    const rowOf = (name: string) => within(table).getByRole('row', { name: new RegExp(name) });

    expect(rowOf('Paracetamol')).toHaveTextContent(/50 tablet by Asha Rao/);
    expect(rowOf('Amoxicillin')).toHaveTextContent('Never restocked');
    expect(rowOf('Ibuprofen')).toHaveTextContent(/10 tablet by Removed user/);
  });

  it('links each low-stock row to the movements for that medicine', async () => {
    mockReport(report({ lowStock: [medicine({ id: 'm42', name: 'Paracetamol' })] as StockReport['lowStock'] }));
    renderWithProviders(<PharmacyReportsPage />);

    const link = await screen.findByRole('link', { name: /See movements for Paracetamol/ });

    expect(link).toHaveAttribute('href', expect.stringContaining('tab=movements'));
    expect(link).toHaveAttribute('href', expect.stringContaining('medicine=m42'));
  });

  it('says nothing is low when nothing is', async () => {
    mockReport(report());
    renderWithProviders(<PharmacyReportsPage />);

    expect(await screen.findByText('Nothing is below its reorder level.')).toBeInTheDocument();
  });

  it('shows the server window, not a client-computed range', async () => {
    mockReport(
      report({ window: { from: '2026-01-02T12:00:00.000Z', to: '2026-02-01T12:00:00.000Z', days: 30 } })
    );
    renderWithProviders(<PharmacyReportsPage />);

    const line = await screen.findByText(/^Restocks from/);
    expect(line).toHaveTextContent(/Jan 2, 2026/);
    expect(line).toHaveTextContent(/Feb 1, 2026/);
  });

  it('names who gets low-stock alerts, with their roles', async () => {
    mockReport(report());
    renderWithProviders(<PharmacyReportsPage />);

    const section = (await screen.findByRole('heading', { name: 'Who gets low-stock alerts' })).parentElement!;
    expect(section).toHaveTextContent('Asha Rao');
    expect(section).toHaveTextContent('Pharmacist');
    expect(section).toHaveTextContent('Dev Patel');
  });

  it('says when nobody gets alerts', async () => {
    mockReport(report({ alertRecipients: [] }));
    renderWithProviders(<PharmacyReportsPage />);

    expect(
      await screen.findByText(/Nobody receives low-stock alerts right now/)
    ).toBeInTheDocument();
  });

  it('shows who restocked in the window, with units and deliveries', async () => {
    mockReport(
      report({
        restockedBy: [
          { actor: asha, units: 340, receipts: 4 },
          { actor: null, units: 20, receipts: 1 },
        ],
      })
    );
    renderWithProviders(<PharmacyReportsPage />);

    const table = await screen.findByRole('table', { name: 'Restocked' });
    const rows = within(table).getAllByRole('row').slice(1);

    expect(rows[0]).toHaveTextContent('Asha Rao');
    expect(rows[0]).toHaveTextContent('340');
    expect(rows[0]).toHaveTextContent('4');
    expect(rows[1]).toHaveTextContent('Removed user');
    expect(screen.queryByText('Top 50 by units received.')).not.toBeInTheDocument();
  });

  it('says it is only the top 50 when there are 50 rows', async () => {
    const fifty = Array.from({ length: 50 }, (_, i) => ({
      actor: { id: `u${i}`, name: `Person ${i}`, role: 'pharmacist' as const },
      units: 100 - i,
      receipts: 1,
    }));
    mockReport(report({ restockedBy: fifty }));
    renderWithProviders(<PharmacyReportsPage />);

    expect(await screen.findByText('Top 50 by units received.')).toBeInTheDocument();
  });

  it('names the window in the restock empty state', async () => {
    mockReport(report({ window: { from: '2026-08-25T00:00:00.000Z', to: '2026-11-23T00:00:00.000Z', days: 90 } }));
    renderWithProviders(<PharmacyReportsPage />, { route: '/?days=90' });

    expect(await screen.findByText('No restocks in the last 90 days.')).toBeInTheDocument();
  });

  it('refetches for a preset window and keeps it in the URL', async () => {
    mockReport(report());
    const user = userEvent.setup();
    renderWithProviders(<PharmacyReportsPage />);
    await screen.findByRole('heading', { name: 'Low stock right now' });

    await user.click(screen.getByRole('button', { name: '90 days' }));

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/medicines/stock-report', { params: { days: 90 } })
    );
    expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('accepts a custom window from 1 to 365', async () => {
    mockReport(report());
    const user = userEvent.setup();
    renderWithProviders(<PharmacyReportsPage />);
    await screen.findByRole('heading', { name: 'Low stock right now' });

    await user.click(screen.getByRole('button', { name: 'Custom' }));
    const input = screen.getByRole('textbox', { name: 'Days' });
    await user.clear(input);
    await user.type(input, '45');

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/medicines/stock-report', { params: { days: 45 } })
    );
  });

  it('does not send a custom window outside 1 to 365', async () => {
    mockReport(report());
    const user = userEvent.setup();
    renderWithProviders(<PharmacyReportsPage />);
    await screen.findByRole('heading', { name: 'Low stock right now' });

    await user.click(screen.getByRole('button', { name: 'Custom' }));
    const input = screen.getByRole('textbox', { name: 'Days' });
    await user.clear(input);
    await user.type(input, '400');

    expect(screen.getByText('Enter a number from 1 to 365.')).toBeInTheDocument();
    // "4" and "40" are valid on the way there; 400 is not and is never requested.
    expect(api.get).not.toHaveBeenCalledWith('/medicines/stock-report', { params: { days: 400 } });
  });

  it('falls back to 30 days when the URL carries nonsense', async () => {
    mockReport(report());
    renderWithProviders(<PharmacyReportsPage />, { route: '/?days=abc' });

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/medicines/stock-report', { params: { days: 30 } })
    );
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the server text and retries on error', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(
      new ApiError('REPORT_DOWN', 'The report is unavailable.', 500)
    );
    const user = userEvent.setup();
    renderWithProviders(<PharmacyReportsPage />);

    expect(await screen.findByText('The report is unavailable.')).toBeInTheDocument();

    vi.mocked(api.get).mockResolvedValueOnce(report());
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Low stock right now' })).toBeInTheDocument();
  });
});

describe('PharmacyReportsPage — stock report states', () => {
  it('shows skeletons shaped like the sections on first load, with no empty-state copy', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<PharmacyReportsPage />);

    expect(screen.getByLabelText('Loading the stock report')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Nothing is below its reorder level.')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Low stock right now' })).not.toBeInTheDocument();
  });

  it('keeps the old report and shows a progress line while a new window loads', async () => {
    mockReport(report({ lowStock: [medicine({ id: 'm1', name: 'Paracetamol' })] as StockReport['lowStock'] }));
    const user = userEvent.setup();
    renderWithProviders(<PharmacyReportsPage />);
    await screen.findByText('Paracetamol');
    expect(screen.queryByRole('progressbar', { name: 'Refreshing' })).not.toBeInTheDocument();

    vi.mocked(api.get).mockReturnValue(new Promise(() => undefined));
    await user.click(screen.getByRole('button', { name: '90 days' }));

    expect(await screen.findByRole('progressbar', { name: 'Refreshing' })).toBeInTheDocument();
    expect(screen.getByText('Paracetamol')).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading the stock report')).not.toBeInTheDocument();
  });

  it('explains a 403 in the app’s own words, in the panel, with a way to retry', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError('FORBIDDEN', 'Forbidden', 403));
    renderWithProviders(<PharmacyReportsPage />);

    expect(await screen.findByText('Couldn’t load the stock report')).toBeInTheDocument();
    expect(screen.getByText('Your role does not have access to this action.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('PharmacyReportsPage — tab in the URL', () => {
  it('opens the movements tab from the link', () => {
    vi.mocked(api.page).mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<PharmacyReportsPage />, { route: '/?tab=movements' });

    expect(screen.getByRole('tab', { name: 'Movements' })).toHaveAttribute('aria-selected', 'true');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('switches tab and writes it to the URL', async () => {
    mockReport(report());
    vi.mocked(api.page).mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderWithProviders(<PharmacyReportsPage />);

    await user.click(screen.getByRole('tab', { name: 'Movements' }));

    expect(screen.getByRole('tab', { name: 'Movements' })).toHaveAttribute('aria-selected', 'true');
  });
});

import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RevenueSummary } from '@/features/billing';
import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { lastDaysRange } from '@/shared/lib/hospital-day';
import { formatMoney } from '@/shared/lib/money';
import { renderWithProviders } from '@/test/render';

import { outstandingBill, pageOf } from '../test-fixtures';
import { AccountantDashboard } from './AccountantDashboard';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const client = vi.mocked(api, true);

const NOW = new Date('2026-11-22T10:12:00.000Z');
const THIRTY = lastDaysRange(30, NOW);
const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

const SUMMARY: RevenueSummary = {
  ...THIRTY,
  billedCents: 6_190_000,
  collectedCents: 4_821_000,
  outstandingCents: 1_369_000,
  count: 240,
  byStatus: {
    unpaid: { billedCents: 910_000, collectedCents: 0, count: 80 },
    partially_paid: { billedCents: 459_000, collectedCents: 200_000, count: 41 },
    paid: { billedCents: 4_821_000, collectedCents: 4_821_000, count: 119 },
  },
};

const OVERDUE = '2026-10-03T00:00:00.000Z';
const LATER = '2026-12-20T00:00:00.000Z';

const OWED = [
  outstandingBill('0412', 'Amina Yusuf', { dueDate: OVERDUE, createdAt: '2026-10-03T08:00:00.000Z' }),
  outstandingBill('0420', 'Jon Okafor', { dueDate: OVERDUE, createdAt: '2026-10-09T08:00:00.000Z' }),
  outstandingBill('0431', 'Kemi Adeyemi', { dueDate: LATER, createdAt: '2026-11-01T08:00:00.000Z' }),
];

interface Setup {
  summary?: unknown;
  owed?: unknown;
}

function setup({ summary = SUMMARY, owed = pageOf(OWED) }: Setup = {}) {
  client.get.mockImplementation((async (path: string) => {
    if (path !== '/bills/revenue') throw new Error(`Unmocked request: ${path}`);
    if (summary instanceof Error) throw summary;
    return summary;
  }) as never);
  client.page.mockImplementation((async (path: string) => {
    if (path !== '/bills/outstanding') throw new Error(`Unmocked page: ${path}`);
    if (owed instanceof Error) throw owed;
    return owed;
  }) as never);
}

const failure = () => new ApiError('INTERNAL_ERROR', 'boom', 500);

function renderDashboard() {
  return renderWithProviders(<AccountantDashboard name="Efe Ogun" />, { route: '/app' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  setup();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AccountantDashboard', () => {
  it('greets the user by first name', () => {
    renderDashboard();
    expect(screen.getByRole('heading', { level: 1, name: 'Good to see you, Efe' })).toBeInTheDocument();
  });

  it('asks for the last 30 days and the oldest unpaid bills, and nothing else', async () => {
    renderDashboard();
    await screen.findByText('Amina Yusuf');

    expect(client.get).toHaveBeenCalledWith('/bills/revenue', { params: THIRTY });
    expect(client.page).toHaveBeenCalledWith('/bills/outstanding', {
      params: { page: 1, limit: 20, sort: 'createdAt' },
    });
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  describe('the next-step sign', () => {
    it('counts overdue bills and says how far back the oldest goes', async () => {
      renderDashboard();

      const sign = await screen.findByRole('link', { name: /next step/i });
      expect(sign).toHaveAttribute('href', '/app/billing/revenue');
      expect(sign).toHaveTextContent(
        `2 bills overdue · Oldest from ${dayMonth.format(new Date('2026-10-03T08:00:00.000Z'))}`
      );
    });

    it('is absent when nothing is past its due date', async () => {
      setup({ owed: pageOf([outstandingBill('0431', 'Kemi Adeyemi', { dueDate: LATER })]) });
      renderDashboard();

      await screen.findByText('Kemi Adeyemi');
      expect(screen.queryByRole('link', { name: /next step/i })).not.toBeInTheDocument();
    });

    it('does not claim a total it cannot know when the first page is all overdue and there are more', async () => {
      const full = Array.from({ length: 20 }, (_, index) =>
        outstandingBill(`f${index}`, `Patient ${index}`, { dueDate: OVERDUE })
      );
      setup({ owed: pageOf(full, { total: 55, totalPages: 3 }) });
      renderDashboard();

      expect(await screen.findByRole('link', { name: /next step/i })).toHaveTextContent('20+ bills overdue');
    });

    it('is absent when the bills could not be loaded', async () => {
      setup({ owed: failure() });
      renderDashboard();

      await screen.findByText('Couldn’t load outstanding bills');
      expect(screen.queryByRole('link', { name: /next step/i })).not.toBeInTheDocument();
    });
  });

  describe('last 30 days', () => {
    it('shows collected against billed as a meter, and what is still owed', async () => {
      renderDashboard();

      const panel = await screen.findByRole('region', { name: 'Last 30 days' });
      const meter = await within(panel).findByRole('meter');
      expect(meter).toHaveAttribute('aria-valuenow', '4821000');
      expect(meter).toHaveAttribute('aria-valuemax', '6190000');
      expect(within(panel).getByText(formatMoney(1_369_000))).toBeInTheDocument();
      expect(within(panel).getByText(/121 bills/)).toBeInTheDocument();
    });

    it('has no meter when nothing was billed', async () => {
      setup({ summary: { ...SUMMARY, billedCents: 0, collectedCents: 0, outstandingCents: 0, count: 0, byStatus: {} } });
      renderDashboard();

      const panel = await screen.findByRole('region', { name: 'Last 30 days' });
      expect(await within(panel).findByText('No bills raised in this period.')).toBeInTheDocument();
      expect(within(panel).queryByRole('meter')).not.toBeInTheDocument();
    });

    it('fails on its own and leaves the oldest-unpaid list working', async () => {
      setup({ summary: failure() });
      renderDashboard();

      expect(await screen.findByText('Couldn’t load the revenue summary')).toBeInTheDocument();
      expect(await screen.findByText('Amina Yusuf')).toBeInTheDocument();
    });
  });

  describe('oldest unpaid', () => {
    it('lists the oldest bills with name, invoice, status word and balance', async () => {
      renderDashboard();

      const panel = await screen.findByRole('region', { name: 'Oldest unpaid' });
      expect(await within(panel).findByText('Amina Yusuf')).toBeInTheDocument();
      expect(within(panel).getByText('INV-2026-0412')).toBeInTheDocument();
      expect(within(panel).getAllByText('Overdue')).toHaveLength(2);
      expect(within(panel).getByText('Unpaid')).toBeInTheDocument();
      expect(within(panel).getAllByText(formatMoney(50_000))).toHaveLength(3);
      expect(within(panel).getByRole('link', { name: 'Open revenue' })).toHaveAttribute(
        'href',
        '/app/billing/revenue'
      );
    });

    it('shows at most six', async () => {
      const many = Array.from({ length: 9 }, (_, index) =>
        outstandingBill(`m${index}`, `Patient ${index}`, { dueDate: LATER })
      );
      setup({ owed: pageOf(many) });
      renderDashboard();

      const panel = await screen.findByRole('region', { name: 'Oldest unpaid' });
      await within(panel).findByText('Patient 0');
      expect(within(panel).getAllByRole('listitem')).toHaveLength(6);
    });

    it('says when nothing is outstanding', async () => {
      setup({ owed: pageOf([]) });
      renderDashboard();

      expect(await screen.findByText('Nothing outstanding.')).toBeInTheDocument();
    });

    it('fails on its own and offers to try again, while the summary still shows', async () => {
      setup({ owed: failure() });
      renderDashboard();

      const panel = await screen.findByRole('region', { name: 'Oldest unpaid' });
      expect(await within(panel).findByText('Couldn’t load outstanding bills')).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(await screen.findByRole('meter')).toBeInTheDocument();
    });
  });
});

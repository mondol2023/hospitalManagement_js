import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RevenueSummary } from '@/features/billing';
import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { lastDaysRange } from '@/shared/lib/hospital-day';
import { formatMoney } from '@/shared/lib/money';
import { renderWithProviders } from '@/test/render';

import { outstandingBill, pageOf } from '../test-fixtures';
import { RevenuePage } from './RevenuePage';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const client = vi.mocked(api, true);

// 16:12 on 22 Nov in the pinned test timezone (Asia/Dhaka, UTC+6).
const NOW = new Date('2026-11-22T10:12:00.000Z');
const THIRTY = lastDaysRange(30, NOW);

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

const SERIES = {
  metric: 'revenue.collectedCents',
  period: 'daily',
  ...THIRTY,
  truncated: false,
  points: [
    { recordedAt: '2026-11-20T00:00:00.000Z', value: 142_000 },
    { recordedAt: '2026-11-21T00:00:00.000Z', value: 98_000 },
    { recordedAt: '2026-11-22T00:00:00.000Z', value: 120_000 },
  ],
};

const OWED = [
  outstandingBill('0412', 'Amina Yusuf', { dueDate: '2026-10-03T00:00:00.000Z' }),
  outstandingBill('0420', 'Jon Okafor', { dueDate: '2026-12-20T00:00:00.000Z' }),
];

type Params = { from?: string; to?: string; page?: number; sort?: string };
type Answer<T> = T | ((params: Params) => T | Promise<T>);

/** What each endpoint says. Swap one entry mid-test to change what a refetch sees. */
let revenueAnswer: Answer<unknown>;
let seriesAnswer: Answer<unknown>;
let owedAnswer: Answer<unknown>;

async function answer<T>(source: Answer<T>, params: Params): Promise<T> {
  return typeof source === 'function' ? (source as (p: Params) => T | Promise<T>)(params) : source;
}

function wire() {
  client.get.mockImplementation((async (path: string, config?: { params?: Params }) => {
    const params = config?.params ?? {};
    if (path === '/bills/revenue') return answer(revenueAnswer, params);
    if (path === '/analytics/series/revenue.collectedCents') return answer(seriesAnswer, params);
    throw new Error(`Unmocked request: ${path}`);
  }) as never);
  client.page.mockImplementation((async (path: string, config?: { params?: Params }) => {
    if (path === '/bills/outstanding') return answer(owedAnswer, config?.params ?? {});
    throw new Error(`Unmocked request: ${path}`);
  }) as never);
}

function renderPage(route = '/app/billing/revenue') {
  return renderWithProviders(<RevenuePage />, { route });
}

function callsTo(mock: typeof client.get | typeof client.page, path: string): Params[] {
  return mock.mock.calls
    .filter(([called]) => called === path)
    .map(([, config]) => (config as { params?: Params }).params ?? {});
}

const revenueCalls = () => callsTo(client.get, '/bills/revenue');
const seriesCalls = () => callsTo(client.get, '/analytics/series/revenue.collectedCents');
const owedCalls = () => callsTo(client.page, '/bills/outstanding');

const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const label = (iso: string) => dayFmt.format(new Date(iso));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  revenueAnswer = SUMMARY;
  seriesAnswer = SERIES;
  owedAnswer = pageOf(OWED, { total: 121, totalPages: 7 });
  wire();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RevenuePage', () => {
  it('shows skeletons under the heading while everything loads', () => {
    revenueAnswer = new Promise(() => undefined);
    renderPage();

    expect(screen.getByRole('heading', { name: 'Revenue' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading revenue summary' })).toBeInTheDocument();
  });

  it('shows how much of what was billed has come in, as a meter', async () => {
    renderPage();

    const meter = await screen.findByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '4821000');
    expect(meter).toHaveAttribute('aria-valuemax', '6190000');
    expect(meter).toHaveAttribute('aria-valuetext', expect.stringContaining('78 percent'));
  });

  it('adds up the open bills from the two unsettled statuses, not from the whole count', async () => {
    renderPage();

    await screen.findByRole('meter');
    const summary = screen.getByRole('region', { name: 'Summary' });
    expect(within(summary).getByText(formatMoney(1_369_000))).toBeInTheDocument();
    expect(within(summary).getByText(/121 bills/)).toBeInTheDocument();
  });

  it('lists the three statuses in a fixed order with their counts and amounts', async () => {
    renderPage();

    const list = await screen.findByRole('list', { name: 'By status' });
    const [unpaid, part, paid] = within(list).getAllByRole('listitem') as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect(unpaid).toHaveTextContent('Unpaid');
    expect(unpaid).toHaveTextContent('80 bills');
    expect(unpaid).toHaveTextContent(formatMoney(910_000));
    expect(part).toHaveTextContent('Part paid');
    expect(part).toHaveTextContent('41 bills');
    expect(paid).toHaveTextContent('Paid');
    expect(paid).toHaveTextContent('119 bills');
  });

  it('shows a zero for a status the server left out, rather than dropping the row', async () => {
    revenueAnswer = { ...SUMMARY, byStatus: { paid: SUMMARY.byStatus.paid } };
    renderPage();

    const list = await screen.findByRole('list', { name: 'By status' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('0 bills');
  });

  it('says it counts bills raised in the window, not bills issued', async () => {
    renderPage();

    expect(
      await screen.findByText(`Bills raised ${label(THIRTY.from)} – ${label(THIRTY.to)}`)
    ).toBeInTheDocument();
  });

  it('says so, and draws no meter, when nothing was billed', async () => {
    revenueAnswer = { ...SUMMARY, billedCents: 0, collectedCents: 0, outstandingCents: 0, count: 0, byStatus: {} };
    renderPage();

    expect(await screen.findByText('No bills raised in this period.')).toBeInTheDocument();
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  });

  it('shows an error with a retry for the summary, and recovers', async () => {
    const user = userEvent.setup();
    revenueAnswer = () => {
      throw new ApiError('INTERNAL_ERROR', 'boom', 500);
    };
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t load the revenue summary');
    // The outstanding list is its own panel and is not taken down with it.
    expect(await screen.findByText('Amina Yusuf')).toBeInTheDocument();

    revenueAnswer = SUMMARY;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('meter')).toBeInTheDocument();
  });
});

describe('range', () => {
  it('asks for the last 30 days by default, for the summary and the trend alike', async () => {
    renderPage();
    await screen.findByRole('meter');
    await screen.findByRole('group', { name: 'Collected per day' });

    expect(revenueCalls()).toEqual([THIRTY]);
    expect(seriesCalls()).toEqual([{ period: 'daily', ...THIRTY }]);
  });

  it('follows ?range= and marks the active segment', async () => {
    renderPage('/app/billing/revenue?range=7');
    await screen.findByRole('meter');

    expect(revenueCalls()).toEqual([lastDaysRange(7, NOW)]);
    expect(seriesCalls()).toEqual([{ period: 'daily', ...lastDaysRange(7, NOW) }]);
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('ignores a range it does not offer', async () => {
    renderPage('/app/billing/revenue?range=5000');
    await screen.findByRole('meter');

    expect(revenueCalls()).toEqual([THIRTY]);
  });

  it('refetches both requests when another segment is chosen', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('meter');

    await user.click(screen.getByRole('button', { name: '90 days' }));

    await waitFor(() => expect(revenueCalls()).toContainEqual(lastDaysRange(90, NOW)));
    expect(seriesCalls()).toContainEqual({ period: 'daily', ...lastDaysRange(90, NOW) });
    expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true');
  });

  // The accountant is mid-read when they switch ranges: the old numbers stay up,
  // dimmed, until the new ones land. Blanking them would be the worse flicker.
  it('keeps the old figures on screen, dimmed, while the new range loads', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('meter');

    revenueAnswer = new Promise(() => undefined);
    await user.click(screen.getByRole('button', { name: '7 days' }));

    const summary = screen.getByRole('region', { name: 'Summary' });
    await waitFor(() => expect(summary).toHaveClass('opacity-60'));
    expect(within(summary).getByRole('meter')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading revenue summary' })).not.toBeInTheDocument();
  });

  describe('custom', () => {
    async function openCustom() {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('meter');
      await user.click(screen.getByRole('button', { name: 'Custom' }));
      return user;
    }

    // A date input is set whole; typing digit by digit would pass through
    // half-entered values that are not dates.
    function setDay(input: HTMLElement, value: string) {
      fireEvent.change(input, { target: { value } });
    }

    it('offers two date inputs, pre-filled with the range that was showing', async () => {
      await openCustom();

      expect(screen.getByLabelText('From')).toHaveValue('2026-10-23');
      expect(screen.getByLabelText('To')).toHaveValue('2026-11-22');
    });

    it('requests the chosen days, from midnight to the end of the last day', async () => {
      await openCustom();
      setDay(screen.getByLabelText('From'), '2026-11-01');

      await waitFor(() =>
        expect(revenueCalls().at(-1)).toEqual({
          from: new Date(2026, 10, 1, 0, 0, 0, 0).toISOString(),
          to: THIRTY.to,
        })
      );
    });

    it('refuses a start after the end, in words, and sends nothing', async () => {
      await openCustom();
      const before = revenueCalls().length;

      setDay(screen.getByLabelText('From'), '2026-11-30');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Start date must be before the end date.'
      );
      expect(screen.getByLabelText('From')).toHaveAttribute('aria-invalid', 'true');
      expect(revenueCalls()).toHaveLength(before);
    });

    it('clears the message once the dates agree again', async () => {
      await openCustom();
      setDay(screen.getByLabelText('From'), '2026-11-30');
      await screen.findByRole('alert');

      setDay(screen.getByLabelText('From'), '2026-11-02');

      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    });

    it('opens a pasted custom link on the range it names', async () => {
      renderPage('/app/billing/revenue?range=custom&from=2026-11-01&to=2026-11-10');
      await screen.findByRole('meter');

      expect(revenueCalls()).toEqual([
        {
          from: new Date(2026, 10, 1, 0, 0, 0, 0).toISOString(),
          to: new Date(2026, 10, 10, 23, 59, 59, 999).toISOString(),
        },
      ]);
      expect(screen.getByLabelText('From')).toHaveValue('2026-11-01');
    });

    it('falls back to 30 days from a pasted custom link that is not a range', async () => {
      renderPage('/app/billing/revenue?range=custom&from=2026-11-10&to=2026-11-01');
      await screen.findByRole('meter');

      expect(revenueCalls()).toEqual([THIRTY]);
    });
  });
});

describe('daily trend', () => {
  it('draws the days from the analytics series', async () => {
    renderPage();

    const bars = await screen.findByRole('group', { name: 'Collected per day' });
    expect(within(bars).getAllByRole('img')).toHaveLength(3);
  });

  // The page lives with its trend refused: a role mismatch is a 403, and the
  // totals and the outstanding list are still the page.
  it('hides only the trend when the role is not served the series', async () => {
    seriesAnswer = () => {
      throw new ApiError('FORBIDDEN', 'Not for your role', 403);
    };
    renderPage();

    expect(await screen.findByText('The daily trend isn’t available for your role.')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toBeInTheDocument();
    expect(screen.getByText('Amina Yusuf')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Collected per day' })).not.toBeInTheDocument();
  });

  it('says the trend failed, with a retry, when it fails for any other reason', async () => {
    const user = userEvent.setup();
    seriesAnswer = () => {
      throw new ApiError('INTERNAL_ERROR', 'boom', 500);
    };
    renderPage();

    expect(await screen.findByText('Couldn’t load the daily trend.')).toBeInTheDocument();
    seriesAnswer = SERIES;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('group', { name: 'Collected per day' })).toBeInTheDocument();
  });

  it('says when the server clamped the range', async () => {
    seriesAnswer = { ...SERIES, truncated: true };
    renderPage();

    expect(await screen.findByText('Showing the latest 3 days.')).toBeInTheDocument();
  });
});

describe('outstanding', () => {
  it('asks for the oldest first, twenty to a page', async () => {
    renderPage();
    await screen.findByText('Amina Yusuf');

    expect(owedCalls()).toEqual([{ page: 1, limit: 20, sort: 'createdAt' }]);
  });

  it('lists who owes, with the balance', async () => {
    renderPage();

    await screen.findByText('Amina Yusuf');
    const owed = screen.getByRole('region', { name: 'Outstanding' });
    const rows = within(owed).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Amina Yusuf');
    expect(rows[0]).toHaveTextContent(formatMoney(50_000));
    expect(rows[1]).toHaveTextContent('Jon Okafor');
  });

  // The list is every unpaid bill, not the ones raised in the chosen window, so
  // the heading says so. And "overdue" counts only what is on this page: the
  // page cannot know a hospital-wide figure (spec O4) and does not pretend to.
  it('says it is every unpaid bill, and counts overdue on this page only', async () => {
    renderPage();

    await screen.findByText('Amina Yusuf');
    const owed = screen.getByRole('region', { name: 'Outstanding' });
    expect(within(owed).getByText(/121 bills, oldest first/)).toBeInTheDocument();
    expect(within(owed).getByText(/1 overdue on this page/)).toBeInTheDocument();
    expect(within(owed).queryByText(/hospital-wide|in total overdue/i)).not.toBeInTheDocument();
  });

  it('leaves the overdue count out when nothing on the page is overdue', async () => {
    owedAnswer = pageOf([OWED[1]!], { total: 1 });
    renderPage();

    const owed = await screen.findByRole('region', { name: 'Outstanding' });
    expect(within(owed).queryByText(/overdue on this page/)).not.toBeInTheDocument();
  });

  it('is not filtered by the revenue range', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Amina Yusuf');

    await user.click(screen.getByRole('button', { name: '7 days' }));
    await waitFor(() => expect(revenueCalls()).toHaveLength(2));

    expect(owedCalls().every((params) => !('from' in params) && !('to' in params))).toBe(true);
  });

  it('pages, and keeps the page in the URL', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Amina Yusuf');

    await user.click(screen.getByRole('button', { name: 'Page 2' }));

    await waitFor(() => expect(owedCalls().at(-1)).toEqual({ page: 2, limit: 20, sort: 'createdAt' }));
  });

  it('opens on the page named in the URL', async () => {
    renderPage('/app/billing/revenue?page=3');
    await screen.findByText('Amina Yusuf');

    expect(owedCalls()).toEqual([{ page: 3, limit: 20, sort: 'createdAt' }]);
  });

  it('says nothing is owed, and where bills come from, when the list is empty', async () => {
    owedAnswer = pageOf([], { total: 0, totalPages: 0 });
    renderPage();

    expect(await screen.findByText('Nothing outstanding.')).toBeInTheDocument();
    expect(screen.getByText(/Bills are raised from the billing page/)).toBeInTheDocument();
  });

  it('shows an error with a retry for the list alone, and recovers', async () => {
    const user = userEvent.setup();
    owedAnswer = () => {
      throw new ApiError('INTERNAL_ERROR', 'boom', 500);
    };
    renderPage();

    expect(await screen.findByText('Couldn’t load outstanding bills')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toBeInTheDocument();

    owedAnswer = pageOf(OWED, { total: 2 });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Amina Yusuf')).toBeInTheDocument();
  });
});

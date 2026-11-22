import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DashboardSnapshot,
  LiveBoard,
  MetricTile,
  OccupancyBoard,
  WardOccupancyRow,
} from '@/features/dashboard';
import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { formatTime } from '@/shared/lib/format';
import { formatMoney } from '@/shared/lib/money';
import { queryKeys } from '@/shared/api/queryKeys';
import { renderWithProviders } from '@/test/render';

import { claimFirstDraw } from '../model/ward-draw';
import { OpsBoard } from './OpsBoard';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

// The once-per-session flag is module state; each test decides which visit it is.
vi.mock('../model/ward-draw', () => ({ claimFirstDraw: vi.fn(() => false) }));

const client = vi.mocked(api, true);

const GENERATED = '2026-11-22T10:41:00.000Z';

const LIVE: LiveBoard = {
  generatedAt: GENERATED,
  openEmergencies: 2,
  unacknowledgedAlerts: 5,
  lowStockCount: 3,
  wards: [],
};

const WARD_A: WardOccupancyRow = {
  ward: 'Ward A',
  total: 20,
  occupied: 18,
  available: 1,
  byStatus: { occupied: 18, cleaning: 1, available: 1 },
  occupancyRate: 90,
};

const WARD_B: WardOccupancyRow = {
  ward: 'Ward B',
  total: 20,
  occupied: 20,
  available: 0,
  byStatus: { occupied: 20 },
  occupancyRate: 100,
};

const OCCUPANCY: OccupancyBoard = {
  generatedAt: GENERATED,
  total: 40,
  occupied: 38,
  available: 1,
  occupancyRate: 95,
  wards: [WARD_A, WARD_B],
};

function tile(metric: MetricTile['metric'], value: number | null): MetricTile {
  return { metric, value, recordedAt: GENERATED, ageMinutes: 4 };
}

const SNAPSHOT: DashboardSnapshot = {
  period: 'daily',
  generatedAt: GENERATED,
  stalestMinutes: 4,
  missing: [],
  tiles: [
    tile('patients.admitted', 112),
    tile('appointments.noShow', 3),
    tile('revenue.billedCents', 820_000),
  ],
};

interface Setup {
  live?: unknown;
  occupancy?: unknown;
  dashboard?: unknown;
}

const never = () => new Promise<never>(() => undefined);

function answer(value: unknown) {
  if (value instanceof Error) throw value;
  return value;
}

function setup({ live = LIVE, occupancy = OCCUPANCY, dashboard = SNAPSHOT }: Setup = {}) {
  client.get.mockImplementation((async (
    path: string,
    config?: { params?: { period?: string } }
  ) => {
    if (path === '/analytics/live') return answer(live);
    if (path === '/analytics/occupancy') return answer(occupancy);
    if (path === '/analytics/dashboard') {
      // The server answers for the period it was asked about.
      const snapshot = answer(dashboard) as DashboardSnapshot;
      return { ...snapshot, period: config?.params?.period ?? snapshot.period };
    }
    throw new Error(`Unmocked request: ${path}`);
  }) as never);
}

const failure = () => new ApiError('INTERNAL_ERROR', 'boom', 500);
const throttled = () => new ApiError('RATE_LIMITED', 'Slow down', 429);

function renderBoard() {
  return renderWithProviders(<OpsBoard name="Sam Okoye" />, { route: '/app' });
}

const liveStrip = () => screen.findByRole('region', { name: 'Live now' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(claimFirstDraw).mockReturnValue(false);
  setup();
});

describe('OpsBoard', () => {
  it('greets the user by first name', () => {
    renderBoard();
    expect(screen.getByRole('heading', { level: 1, name: 'Good to see you, Sam' })).toBeInTheDocument();
  });

  it('asks for the live board, the ward occupancy and the daily tiles, and nothing else', async () => {
    renderBoard();
    await screen.findByText('Ward A');

    const paths = client.get.mock.calls.map(([path]) => path).sort();
    expect(paths).toEqual(['/analytics/dashboard', '/analytics/live', '/analytics/occupancy']);
    expect(client.get).toHaveBeenCalledWith('/analytics/dashboard', { params: { period: 'daily' } });
  });

  it('puts what someone acts on first: live strip, then the wards, then the rolled-up figures', async () => {
    renderBoard();
    const live = await screen.findByRole('region', { name: 'Live now' });
    const wards = await screen.findByRole('region', { name: 'Wards' });
    const rolled = await screen.findByRole('region', { name: 'Rolled-up figures' });

    expect(live.compareDocumentPosition(wards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(wards.compareDocumentPosition(rolled) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  describe('the next-step sign', () => {
    it('points at the open emergencies, which come before anything else', async () => {
      renderBoard();

      const sign = await screen.findByRole('link', { name: /next step/i });
      expect(sign).toHaveAttribute('href', '/app/emergencies');
      expect(sign).toHaveTextContent('2 open emergencies');
    });

    it('says "emergency" for one', async () => {
      setup({ live: { ...LIVE, openEmergencies: 1 } });
      renderBoard();

      expect(await screen.findByRole('link', { name: /next step/i })).toHaveTextContent(
        '1 open emergency'
      );
    });

    it('is absent when nothing is open, however many alerts are waiting', async () => {
      setup({ live: { ...LIVE, openEmergencies: 0 } });
      renderBoard();

      await within(await liveStrip()).findByText('None open');
      expect(screen.queryByRole('link', { name: /next step/i })).not.toBeInTheDocument();
    });

    it('is absent when the live figures could not be loaded', async () => {
      setup({ live: failure() });
      renderBoard();

      await screen.findByText('Couldn’t load the live figures');
      expect(screen.queryByRole('link', { name: /next step/i })).not.toBeInTheDocument();
    });
  });

  describe('live strip', () => {
    it('shows each count with its word, so colour is never the only signal', async () => {
      renderBoard();

      const strip = await liveStrip();
      expect(await within(strip).findByRole('link', { name: 'Emergencies 2 open' })).toBeInTheDocument();
      expect(within(strip).getByText('Needs attention')).toBeInTheDocument();
      expect(within(strip).getByText('5 waiting')).toBeInTheDocument();
      expect(within(strip).getByRole('link', { name: 'Low stock 3 low' })).toBeInTheDocument();
    });

    it('links emergencies and low stock to the pages that deal with them', async () => {
      renderBoard();

      const strip = await liveStrip();
      expect(await within(strip).findByRole('link', { name: /emergencies/i })).toHaveAttribute(
        'href',
        '/app/emergencies'
      );
      expect(within(strip).getByRole('link', { name: /low stock/i })).toHaveAttribute(
        'href',
        '/app/pharmacy'
      );
    });

    it('does not link the attention count to the ward feed, which an admin cannot open', async () => {
      renderBoard();

      const strip = await liveStrip();
      await within(strip).findByText('5 waiting');
      expect(within(strip).queryByRole('link', { name: /needs attention/i })).not.toBeInTheDocument();
    });

    it('mutes a count of zero and says so in words', async () => {
      setup({ live: { ...LIVE, openEmergencies: 0, unacknowledgedAlerts: 0, lowStockCount: 0 } });
      renderBoard();

      const strip = await liveStrip();
      expect(await within(strip).findByText('None open')).toBeInTheDocument();
      expect(within(strip).getByText('None waiting')).toBeInTheDocument();
      expect(within(strip).getByText('None low')).toBeInTheDocument();
    });

    it('shows a dash for a count it does not have, never a zero', async () => {
      setup({ live: { ...LIVE, lowStockCount: null } });
      renderBoard();

      const strip = await liveStrip();
      const cell = await within(strip).findByRole('link', { name: /low stock/i });
      expect(cell).toHaveTextContent('—');
      expect(cell).not.toHaveTextContent('None low');
    });

    it('fails on its own and offers to try again, while the rest of the board works', async () => {
      setup({ live: failure() });
      renderBoard();

      const strip = await liveStrip();
      expect(await within(strip).findByText('Couldn’t load the live figures')).toBeInTheDocument();
      expect(within(strip).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(await screen.findByText('Ward A')).toBeInTheDocument();
      expect(await screen.findByText('Admitted')).toBeInTheDocument();
    });

    it('shows a loading state while the live figures are on their way', () => {
      client.get.mockImplementation(never as never);
      renderBoard();

      expect(screen.getByRole('status', { name: 'Loading live figures' })).toBeInTheDocument();
    });
  });

  describe('wards', () => {
    it('draws one track per ward, with every number in the text', async () => {
      renderBoard();

      const wards = await screen.findByRole('region', { name: 'Wards' });
      const items = await within(wards).findAllByRole('listitem');
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent('Ward A');
      expect(items[0]).toHaveTextContent('18 of 20');
      expect(items[0]).toHaveTextContent('free 1');
    });

    it('badges a ward with no free beds as Full', async () => {
      renderBoard();

      const wards = await screen.findByRole('region', { name: 'Wards' });
      const items = await within(wards).findAllByRole('listitem');
      const [wardA, wardB] = items as [HTMLElement, HTMLElement];
      expect(within(wardB).getByText('Full')).toBeInTheDocument();
      expect(within(wardA).queryByText('Full')).not.toBeInTheDocument();
    });

    it('says when the figures were taken', async () => {
      renderBoard();

      expect(await screen.findByText(`Updated ${formatTime(GENERATED)}`)).toBeInTheDocument();
    });

    it('says when no wards are set up', async () => {
      setup({ occupancy: { ...OCCUPANCY, wards: [] } });
      renderBoard();

      expect(await screen.findByText('No wards configured')).toBeInTheDocument();
    });

    it('fails on its own and offers to try again', async () => {
      setup({ occupancy: failure() });
      renderBoard();

      const wards = await screen.findByRole('region', { name: 'Wards' });
      expect(await within(wards).findByText('Couldn’t load ward occupancy')).toBeInTheDocument();
      expect(within(wards).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(await screen.findByRole('link', { name: /next step/i })).toBeInTheDocument();
    });

    it('draws the tracks on the first visit of a session', async () => {
      vi.mocked(claimFirstDraw).mockReturnValue(true);
      const { container } = renderBoard();

      await screen.findByText('Ward A');
      // Mid-draw by the time the query has answered, so "not yet complete" is
      // the claim, not the exact first frame.
      const width = container.querySelector('clipPath rect')?.getAttribute('width') ?? '100%';
      expect(parseFloat(width)).toBeLessThan(100);
    });

    it('shows them complete on every later visit', async () => {
      vi.mocked(claimFirstDraw).mockReturnValue(false);
      const { container } = renderBoard();

      await screen.findByText('Ward A');
      expect(container.querySelector('clipPath rect')).toHaveAttribute('width', '100%');
    });

    it('claims the first draw once per visit, not once per render', async () => {
      const { client: queries } = renderBoard();
      await screen.findByText('Ward A');

      await queries.refetchQueries({ queryKey: queryKeys.analytics.occupancy });

      expect(claimFirstDraw).toHaveBeenCalledTimes(1);
    });
  });

  describe('rolled-up figures', () => {
    it('shows the tiles, money included, because admin and manager are finance roles', async () => {
      renderBoard();

      const rolled = await screen.findByRole('region', { name: 'Rolled-up figures' });
      expect(await within(rolled).findByText('Admitted')).toBeInTheDocument();
      expect(within(rolled).getByText('112')).toBeInTheDocument();
      expect(within(rolled).getByText(formatMoney(820_000))).toBeInTheDocument();
    });

    it('names the period it is showing', async () => {
      renderBoard();

      expect(await screen.findByRole('heading', { name: 'Rolled-up figures (daily)' })).toBeInTheDocument();
    });

    it('asks for the other period when the select changes', async () => {
      const user = userEvent.setup();
      renderBoard();
      await screen.findByText('Admitted');

      await user.selectOptions(screen.getByLabelText('Period'), 'weekly');

      await waitFor(() =>
        expect(client.get).toHaveBeenCalledWith('/analytics/dashboard', { params: { period: 'weekly' } })
      );
      expect(await screen.findByRole('heading', { name: 'Rolled-up figures (weekly)' })).toBeInTheDocument();
    });

    it('renders a tile it has no value for as a dash', async () => {
      setup({ dashboard: { ...SNAPSHOT, tiles: [tile('patients.admitted', null)] } });
      renderBoard();

      expect(await screen.findByText('Not collected yet')).toBeInTheDocument();
    });

    it('says so when the rollup has fallen behind', async () => {
      setup({ dashboard: { ...SNAPSHOT, stalestMinutes: 95 } });
      renderBoard();

      expect(await screen.findByText(/last rolled up 95 minutes ago/)).toBeInTheDocument();
    });

    it('stays quiet when the rollup is a few minutes old', async () => {
      renderBoard();

      await screen.findByText('Admitted');
      expect(screen.queryByText(/last rolled up/)).not.toBeInTheDocument();
    });

    it('fails on its own and offers to try again, while the live strip and wards still work', async () => {
      setup({ dashboard: failure() });
      renderBoard();

      const rolled = await screen.findByRole('region', { name: 'Rolled-up figures' });
      expect(await within(rolled).findByText('Couldn’t load the rolled-up figures')).toBeInTheDocument();
      expect(within(rolled).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(await screen.findByText('Ward A')).toBeInTheDocument();
    });
  });

  describe('when the reporting limiter says slow down', () => {
    it('keeps the last figures and says they will refresh on their own', async () => {
      const { client: queries } = renderBoard();
      await screen.findByText('Ward A');

      setup({ live: throttled(), occupancy: throttled(), dashboard: throttled() });
      await queries.refetchQueries({ queryKey: queryKeys.analytics.live });

      expect(
        await screen.findByText('Figures paused for a minute to ease the load. They’ll refresh on their own.')
      ).toBeInTheDocument();
      expect(screen.getByText('Ward A')).toBeInTheDocument();
      expect(within(await liveStrip()).getByRole('link', { name: 'Emergencies 2 open' })).toBeInTheDocument();
    });

    it('says nothing on a board that is working', async () => {
      renderBoard();

      await screen.findByText('Ward A');
      expect(screen.queryByText(/Figures paused/)).not.toBeInTheDocument();
    });
  });
});

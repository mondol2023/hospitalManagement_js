import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth';
import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { renderWithProviders } from '@/test/render';

import { agendaRow, followUp, pageOf, record, routes, userOf } from '../test-fixtures';
import { DoctorDashboard } from './DoctorDashboard';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const client = vi.mocked(api, true);

const DAY = '/appointments/doctor/u-doc/day';
const FOLLOW_UPS = '/medical-records/follow-ups';
const MINE = '/medical-records/me';
type Config = { params?: Record<string, unknown> };

interface Setup {
  day?: unknown;
  overdue?: unknown;
  upcoming?: unknown;
  mine?: unknown;
}

function setup({
  day = [agendaRow('a1', 'Ada Lovelace'), agendaRow('a2', 'Grace Hopper', { status: 'pending' })],
  overdue = pageOf([followUp('f1', 'Bea Arthur')]),
  upcoming = pageOf([followUp('f2', 'Cy Young', { followUpDate: '2026-11-25T00:00:00.000Z' })]),
  mine = pageOf([record('r1', 'Dee Reese'), record('r2', 'Eli Moss')]),
}: Setup = {}) {
  client.get.mockImplementation(
    routes({ [DAY]: day, '/medical-records/r1': record('r1', 'Dee Reese') })
  );
  client.page.mockImplementation(
    routes({
      [FOLLOW_UPS]: (config?: Config) => (config?.params?.overdue ? overdue : upcoming),
      [MINE]: mine,
    })
  );
}

const failure = () => new ApiError('INTERNAL_ERROR', 'boom', 500);

function renderDashboard() {
  return renderWithProviders(<DoctorDashboard name="Imani Khan" />, { route: '/app' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-21T08:50:00.000Z') });
  useAuthStore
    .getState()
    .setSession({ user: userOf('doctor'), accessToken: 'a', refreshToken: 'r' });
  setup();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DoctorDashboard', () => {
  it('greets the doctor by first name', () => {
    renderDashboard();

    expect(screen.getByRole('heading', { level: 1, name: /good to see you, imani/i })).toBeInTheDocument();
  });

  describe('today’s visits', () => {
    it('lists today’s visits and how many are left', async () => {
      renderDashboard();

      const panel = await screen.findByRole('region', { name: /today’s visits/i });
      expect(await within(panel).findByText('Ada Lovelace')).toBeInTheDocument();
      expect(within(panel).getByText('Grace Hopper')).toBeInTheDocument();
      expect(within(panel).getByText(/2 still to see/i)).toBeInTheDocument();
      expect(within(panel).getByText('Confirmed')).toBeInTheDocument();
      expect(client.get).toHaveBeenCalledWith(DAY, { params: { date: '2026-11-21' } });
    });

    it('links to the whole day', async () => {
      renderDashboard();

      const panel = await screen.findByRole('region', { name: /today’s visits/i });
      expect(within(panel).getByRole('link', { name: /my day/i })).toHaveAttribute(
        'href',
        '/app/schedule'
      );
    });

    it('says when the day is clear', async () => {
      setup({ day: [] });
      renderDashboard();

      expect(await screen.findByText(/nothing left today/i)).toBeInTheDocument();
    });

    it('names a visit whose patient is gone as unknown', async () => {
      setup({ day: [agendaRow('a1', 'x', { patient: 'p-gone' as never })] });
      renderDashboard();

      expect(await screen.findByText('Unknown patient')).toBeInTheDocument();
    });
  });

  describe('follow-ups', () => {
    it('counts what is overdue and what is coming, and lists both', async () => {
      setup({
        overdue: pageOf([followUp('f1', 'Bea Arthur')], { total: 3 }),
        upcoming: pageOf([followUp('f2', 'Cy Young')], { total: 4 }),
      });
      renderDashboard();

      const panel = await screen.findByRole('region', { name: /follow-ups/i });
      expect(await within(panel).findByText('Bea Arthur')).toBeInTheDocument();
      expect(within(panel).getByText('Cy Young')).toBeInTheDocument();
      expect(within(panel).getByText(/3 overdue/i)).toBeInTheDocument();
      expect(within(panel).getByText(/4 in the next 7 days/i)).toBeInTheDocument();
      // Overdue is said in words, not left to a colour.
      expect(within(panel).getAllByText('Overdue').length).toBeGreaterThan(0);
    });

    it('asks only for the few it shows', async () => {
      renderDashboard();
      await screen.findByText('Bea Arthur');

      const asked = client.page.mock.calls
        .filter(([path]) => path === FOLLOW_UPS)
        .map(([, config]) => (config as Config).params);
      expect(asked).toEqual(
        expect.arrayContaining([
          { overdue: true, limit: 5 },
          { days: 7, limit: 5 },
        ])
      );
    });

    it('opens the record behind a follow-up', async () => {
      client.get.mockImplementation(
        routes({
          [DAY]: [],
          '/medical-records/f1': record('f1', 'Bea Arthur'),
        })
      );
      renderDashboard();

      await userEvent.click(await screen.findByRole('button', { name: /bea arthur/i }));

      expect(await screen.findByRole('dialog', { name: /bea arthur/i })).toBeInTheDocument();
    });

    it('links to the full list', async () => {
      renderDashboard();

      const panel = await screen.findByRole('region', { name: /follow-ups/i });
      expect(within(panel).getByRole('link', { name: /see all/i })).toHaveAttribute(
        'href',
        '/app/follow-ups'
      );
    });

    it('says so when nobody is due', async () => {
      setup({ overdue: pageOf([]), upcoming: pageOf([]) });
      renderDashboard();

      expect(await screen.findByText(/no follow-ups due this week/i)).toBeInTheDocument();
    });
  });

  describe('recent records', () => {
    it('shows the five most recent', async () => {
      renderDashboard();

      const panel = await screen.findByRole('region', { name: /recent records/i });
      expect(await within(panel).findByText('Dee Reese')).toBeInTheDocument();
      expect(within(panel).getByText('Eli Moss')).toBeInTheDocument();
      expect(client.page).toHaveBeenCalledWith(MINE, { params: { limit: 5 } });
      expect(within(panel).getByRole('link', { name: /see all/i })).toHaveAttribute(
        'href',
        '/app/records'
      );
    });

    it('opens a record from the list', async () => {
      renderDashboard();

      await userEvent.click(await screen.findByRole('button', { name: /dee reese/i }));

      const dialog = await screen.findByRole('dialog', { name: /dee reese/i });
      expect(dialog).toHaveTextContent('Headaches for two weeks');
    });

    it('invites the first consultation', async () => {
      setup({ mine: pageOf([]) });
      renderDashboard();

      expect(await screen.findByText(/no consultations recorded yet/i)).toBeInTheDocument();
    });
  });

  describe('when one panel fails', () => {
    it('keeps the others, and retries only itself', async () => {
      client.get.mockImplementation(async (path: string) => {
        if (path === DAY) throw failure();
        throw new Error(`Unmocked request: ${path}`);
      });
      renderDashboard();

      expect(await screen.findByText(/couldn’t load today’s visits/i)).toBeInTheDocument();
      expect(await screen.findByText('Dee Reese')).toBeInTheDocument();
      expect(screen.getByText('Bea Arthur')).toBeInTheDocument();

      setup();
      await userEvent.click(screen.getByRole('button', { name: /try again/i }));
      expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    });

    it('does the same for the follow-ups panel', async () => {
      client.page.mockImplementation(
        routes({
          [FOLLOW_UPS]: () => {
            throw failure();
          },
          [MINE]: pageOf([record('r1', 'Dee Reese')]),
        })
      );
      renderDashboard();

      expect(await screen.findByText(/couldn’t load follow-ups/i)).toBeInTheDocument();
      expect(await screen.findByText('Dee Reese')).toBeInTheDocument();
      expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    });

    it('does the same for the recent records panel', async () => {
      client.page.mockImplementation(
        routes({
          [FOLLOW_UPS]: () => pageOf([]),
          [MINE]: () => {
            throw failure();
          },
        })
      );
      renderDashboard();

      expect(await screen.findByText(/couldn’t load recent records/i)).toBeInTheDocument();
      expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    });
  });

  it('shows a skeleton in each panel while it loads', () => {
    client.get.mockReturnValue(new Promise(() => {}));
    client.page.mockReturnValue(new Promise(() => {}));
    renderDashboard();

    expect(screen.getByRole('status', { name: /loading today’s visits/i })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /loading follow-ups/i })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /loading recent records/i })).toBeInTheDocument();
  });

  it('closes the drawer back to the dashboard', async () => {
    renderDashboard();

    await userEvent.click(await screen.findByRole('button', { name: /dee reese/i }));
    const dialog = await screen.findByRole('dialog', { name: /dee reese/i });
    await userEvent.click(within(dialog).getByRole('button', { name: /close/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

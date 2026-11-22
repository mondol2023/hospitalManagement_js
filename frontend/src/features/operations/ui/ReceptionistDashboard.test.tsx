import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { formatTime } from '@/shared/lib/format';
import { toast } from '@/shared/ui';
import { renderWithProviders } from '@/test/render';

import { arrival, bed, pageOf } from '../test-fixtures';
import { ReceptionistDashboard } from './ReceptionistDashboard';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const client = vi.mocked(api, true);

const NOW = new Date('2026-11-22T10:12:00.000Z');

interface Setup {
  arrivals?: unknown;
  openEmergencies?: number | null;
  free?: unknown[];
}

function setup({
  arrivals = pageOf([
    arrival('a1', 'Jide Okafor', { status: 'confirmed', scheduledAt: '2026-11-22T09:00:00.000Z' }),
    arrival('a2', 'Amina Yusuf', { status: 'pending', scheduledAt: '2026-11-22T10:30:00.000Z' }),
    arrival('a3', 'Kofi Mensah', { status: 'confirmed', scheduledAt: '2026-11-22T11:15:00.000Z' }),
  ]),
  openEmergencies = 0,
  free = [bed('1', 'Ward A'), bed('2', 'Ward A')],
}: Setup = {}) {
  client.page.mockImplementation((async (path: string) => {
    if (path !== '/appointments') throw new Error(`Unmocked page: ${path}`);
    if (arrivals instanceof Error) throw arrivals;
    return arrivals;
  }) as never);

  client.get.mockImplementation((async (path: string) => {
    if (path === '/beds/wards') return ['Ward A', 'Ward B'];
    if (path === '/beds/available') return free;
    if (path === '/analytics/live') {
      return { generatedAt: NOW.toISOString(), openEmergencies, unacknowledgedAlerts: 0, lowStockCount: 0, wards: [] };
    }
    throw new Error(`Unmocked request: ${path}`);
  }) as never);
}

const failure = () => new ApiError('INTERNAL_ERROR', 'boom', 500);

function renderDashboard() {
  return renderWithProviders(<ReceptionistDashboard name="Sam Okoye" />, { route: '/app' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  vi.spyOn(toast, 'success').mockImplementation(() => '');
  vi.spyOn(toast, 'info').mockImplementation(() => '');
  vi.spyOn(toast, 'error').mockImplementation(() => '');
  setup();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ReceptionistDashboard', () => {
  it('greets the user by first name', () => {
    renderDashboard();
    expect(screen.getByRole('heading', { level: 1, name: 'Good to see you, Sam' })).toBeInTheDocument();
  });

  describe('the next-step sign', () => {
    it('points at the next visit still ahead, with who and with whom', async () => {
      renderDashboard();

      const sign = await screen.findByRole('link', { name: /next step/i });
      expect(sign).toHaveAttribute('href', '/app/front-desk');
      expect(sign).toHaveTextContent(`Next arrival ${formatTime('2026-11-22T10:30:00.000Z')} · Amina Yusuf with Dr Rao`);
    });

    it('skips visits that are over or already in the past', async () => {
      setup({
        arrivals: pageOf([
          arrival('a1', 'Jide Okafor', { status: 'pending', scheduledAt: '2026-11-22T09:00:00.000Z' }),
          arrival('a2', 'Done Person', { status: 'completed', scheduledAt: '2026-11-22T10:30:00.000Z' }),
          arrival('a3', 'Kofi Mensah', { status: 'confirmed', scheduledAt: '2026-11-22T11:15:00.000Z' }),
        ]),
      });
      renderDashboard();

      expect(await screen.findByRole('link', { name: /next step/i })).toHaveTextContent('Kofi Mensah');
    });

    it('is absent when nothing is still ahead', async () => {
      setup({ arrivals: pageOf([]) });
      renderDashboard();

      await screen.findByText('No visits booked for today.');
      expect(screen.queryByRole('link', { name: /next step/i })).not.toBeInTheDocument();
    });
  });

  describe('arrivals today', () => {
    it('lists visits still to deal with, earliest first, and leaves finished ones out', async () => {
      setup({
        arrivals: pageOf([
          arrival('a1', 'Jide Okafor', { status: 'completed', scheduledAt: '2026-11-22T08:00:00.000Z' }),
          arrival('a2', 'Amina Yusuf', { status: 'pending', scheduledAt: '2026-11-22T10:30:00.000Z' }),
          arrival('a3', 'Ngozi Eze', { status: 'no_show', scheduledAt: '2026-11-22T09:00:00.000Z' }),
        ]),
      });
      renderDashboard();

      const panel = await screen.findByRole('region', { name: /arrivals today/i });
      expect(await within(panel).findByText('Amina Yusuf')).toBeInTheDocument();
      expect(within(panel).queryByText('Jide Okafor')).not.toBeInTheDocument();
      expect(within(panel).queryByText('Ngozi Eze')).not.toBeInTheDocument();
    });

    it('shows at most six rows and says how many there are in all', async () => {
      const many = Array.from({ length: 8 }, (_, index) =>
        arrival(`m${index}`, `Patient ${index}`, {
          status: 'confirmed',
          scheduledAt: `2026-11-22T1${index}:00:00.000Z`,
        })
      );
      setup({ arrivals: pageOf(many, { total: 14, totalPages: 1 }) });
      renderDashboard();

      const panel = await screen.findByRole('region', { name: /arrivals today/i });
      await within(panel).findByText('Patient 0');
      expect(within(panel).getAllByRole('listitem')).toHaveLength(6);
      expect(within(panel).getByRole('link', { name: 'See all 14 at the front desk' })).toHaveAttribute(
        'href',
        '/app/front-desk'
      );
    });

    it('confirms a pending visit inline', async () => {
      client.post.mockResolvedValue({ id: 'a2', status: 'confirmed' });
      renderDashboard();

      await userEvent.click(await screen.findByRole('button', { name: 'Confirm visit for Amina Yusuf' }));

      expect(client.post).toHaveBeenCalledWith('/appointments/a2/confirm');
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Visit confirmed for Amina Yusuf'));
    });

    it('says when nothing is booked, and where visits come from', async () => {
      setup({ arrivals: pageOf([]) });
      renderDashboard();

      expect(await screen.findByText('No visits booked for today.')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /see all/i })).not.toBeInTheDocument();
    });

    it('says so when every visit today is already finished', async () => {
      setup({
        arrivals: pageOf([
          arrival('a1', 'Jide Okafor', { status: 'completed', scheduledAt: '2026-11-22T08:00:00.000Z' }),
        ]),
      });
      renderDashboard();

      expect(await screen.findByText('Nothing left to confirm today.')).toBeInTheDocument();
      expect(screen.queryByText('No visits booked for today.')).not.toBeInTheDocument();
    });

    it('fails on its own and offers to try again, while free beds still show', async () => {
      setup({ arrivals: failure() });
      renderDashboard();

      expect(await screen.findByText('Couldn’t load arrivals')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(await screen.findByText('2 free')).toBeInTheDocument();
    });
  });

  it('shows free beds per ward', async () => {
    renderDashboard();

    const panel = await screen.findByRole('region', { name: 'Free beds' });
    expect(await within(panel).findByText('2 free')).toBeInTheDocument();
    expect(within(panel).getByText('0 free')).toBeInTheDocument();
  });

  describe('the live strip', () => {
    it('is hidden while no emergency is open', async () => {
      renderDashboard();

      await screen.findByText('Amina Yusuf');
      await waitFor(() => expect(client.get).toHaveBeenCalledWith('/analytics/live'));
      expect(screen.queryByText(/open emergenc/i)).not.toBeInTheDocument();
    });

    it('says how many are open, in words, and links to them', async () => {
      setup({ openEmergencies: 1 });
      renderDashboard();

      const strip = await screen.findByRole('link', { name: /open emergencies: 1/i });
      expect(strip).toHaveAttribute('href', '/app/emergencies');
    });

    it('stays out of the way when the board cannot be read', async () => {
      client.get.mockImplementation((async (path: string) => {
        if (path === '/analytics/live') throw failure();
        if (path === '/beds/wards') return ['Ward A'];
        if (path === '/beds/available') return [];
        throw new Error(`Unmocked request: ${path}`);
      }) as never);
      renderDashboard();

      await screen.findByText('Amina Yusuf');
      expect(screen.queryByText(/open emergenc/i)).not.toBeInTheDocument();
    });
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { renderWithProviders } from '@/test/render';

import { batch } from '../test-fixtures';
import { PharmacistDashboard } from './PharmacistDashboard';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const client = vi.mocked(api, true);

const NOW = new Date('2026-11-22T10:12:00.000Z');

function medicine(id: string, name: string, quantity: number, reorderLevel: number, unit = 'tablet') {
  return { id, name, quantity, reorderLevel, unit, batchNumber: `B-${id}`, isActive: true };
}

interface Setup {
  shelf?: unknown;
  low?: unknown;
}

function setup({
  shelf = [
    batch('x1', '2026-11-02T00:00:00.000Z', { name: 'Amoxicillin 250 mg', quantity: 120, unit: 'capsule' }),
    batch('x2', '2026-11-10T00:00:00.000Z', { name: 'Ibuprofen 200 mg', quantity: 30 }),
    batch('s1', '2026-12-01T00:00:00.000Z', { name: 'Paracetamol 500 mg', quantity: 400 }),
    batch('s2', '2026-12-15T00:00:00.000Z', { name: 'Metformin 500 mg', quantity: 60 }),
  ],
  low = [medicine('m1', 'Insulin glargine', 12, 50, 'vial'), medicine('m2', 'Saline 0.9%', 40, 100, 'ml')],
}: Setup = {}) {
  client.get.mockImplementation((async (path: string) => {
    if (path === '/medicines/expiring') {
      if (shelf instanceof Error) throw shelf;
      return shelf;
    }
    if (path === '/medicines/low-stock') {
      if (low instanceof Error) throw low;
      return low;
    }
    throw new Error(`Unmocked request: ${path}`);
  }) as never);
}

const failure = () => new ApiError('INTERNAL_ERROR', 'boom', 500);

function renderDashboard() {
  return renderWithProviders(<PharmacistDashboard name="Tunde Bello" />, { route: '/app' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  setup();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PharmacistDashboard', () => {
  it('greets the user by first name', () => {
    renderDashboard();
    expect(screen.getByRole('heading', { level: 1, name: 'Good to see you, Tunde' })).toBeInTheDocument();
  });

  it('asks for the next 30 days of expiry, once, and never writes anything', async () => {
    renderDashboard();
    await screen.findByText('Paracetamol 500 mg');

    const calls = client.get.mock.calls.filter(([path]) => path === '/medicines/expiring');
    expect(calls).toHaveLength(1);
    expect(calls[0]![1]).toEqual({ params: { days: 30 } });
    expect(client.post).not.toHaveBeenCalled();
    expect(client.patch).not.toHaveBeenCalled();
  });

  describe('the next-step sign', () => {
    it('points at the expiry page when batches have expired', async () => {
      renderDashboard();

      const sign = await screen.findByRole('link', { name: /next step/i });
      expect(sign).toHaveAttribute('href', '/app/pharmacy/expiry');
      expect(sign).toHaveTextContent('2 batches have expired · Review and withdraw');
    });

    it('says "1 batch has expired" for one', async () => {
      setup({ shelf: [batch('x1', '2026-11-02T00:00:00.000Z')] });
      renderDashboard();

      expect(await screen.findByRole('link', { name: /next step/i })).toHaveTextContent(
        '1 batch has expired · Review and withdraw'
      );
    });

    it('names the next expiry when nothing has expired yet', async () => {
      setup({
        shelf: [
          batch('s2', '2026-12-15T00:00:00.000Z', { name: 'Metformin 500 mg' }),
          batch('s1', '2026-12-01T00:00:00.000Z', { name: 'Paracetamol 500 mg' }),
        ],
      });
      renderDashboard();

      const sign = await screen.findByRole('link', { name: /next step/i });
      expect(sign).toHaveAttribute('href', '/app/pharmacy/expiry');
      expect(sign).toHaveTextContent('Next expiry in 9 days · Paracetamol 500 mg');
    });

    it('is absent when nothing is expired or due', async () => {
      setup({ shelf: [] });
      renderDashboard();

      await screen.findByText('Nothing expires in the next 30 days.');
      expect(screen.queryByRole('link', { name: /next step/i })).not.toBeInTheDocument();
    });
  });

  describe('low stock', () => {
    it('lists what is below its reorder level, with units', async () => {
      renderDashboard();

      const panel = await screen.findByRole('region', { name: 'Low stock' });
      expect(await within(panel).findByText('Insulin glargine')).toBeInTheDocument();
      expect(within(panel).getByText('12 of 50 vials')).toBeInTheDocument();
      expect(within(panel).getByText('40 of 100 ml')).toBeInTheDocument();
      expect(within(panel).getByRole('link', { name: 'Open pharmacy' })).toHaveAttribute('href', '/app/pharmacy');
    });

    it('says when everything is stocked', async () => {
      setup({ low: [] });
      renderDashboard();

      expect(await screen.findByText('Nothing is below its reorder level.')).toBeInTheDocument();
    });

    it('fails on its own while the expiry panel still works', async () => {
      setup({ low: failure() });
      renderDashboard();

      expect(await screen.findByText('Couldn’t load low stock')).toBeInTheDocument();
      expect(await screen.findByText('Paracetamol 500 mg')).toBeInTheDocument();
    });
  });

  describe('expiring soon', () => {
    it('lists the soonest batches, not the expired ones, with the date and how far off it is', async () => {
      renderDashboard();

      const panel = await screen.findByRole('region', { name: 'Expiring soon' });
      expect(await within(panel).findByText('Paracetamol 500 mg')).toBeInTheDocument();
      expect(within(panel).getByText('Metformin 500 mg')).toBeInTheDocument();
      expect(within(panel).queryByText('Amoxicillin 250 mg')).not.toBeInTheDocument();
      expect(within(panel).getByText('B-S1')).toBeInTheDocument();
      expect(within(panel).getByText('400 tablets')).toBeInTheDocument();
      expect(within(panel).getByText('in 9 days')).toBeInTheDocument();
      expect(within(panel).getByRole('link', { name: 'Review expiry' })).toHaveAttribute(
        'href',
        '/app/pharmacy/expiry'
      );
    });

    it('shows at most six', async () => {
      setup({
        shelf: Array.from({ length: 9 }, (_, index) =>
          batch(`s${index}`, `2026-12-0${index + 1}T00:00:00.000Z`, { name: `Drug ${index}` })
        ),
      });
      renderDashboard();

      const panel = await screen.findByRole('region', { name: 'Expiring soon' });
      await within(panel).findByText('Drug 0');
      expect(within(panel).getAllByRole('listitem')).toHaveLength(6);
    });

    it('has no write-off action anywhere on the dashboard', async () => {
      renderDashboard();
      await screen.findByText('Paracetamol 500 mg');

      expect(screen.queryByRole('button', { name: /withdraw|write off/i })).not.toBeInTheDocument();
    });

    it('says when nothing expires, and points at the expiry page', async () => {
      setup({ shelf: [] });
      renderDashboard();

      const panel = await screen.findByRole('region', { name: 'Expiring soon' });
      expect(await within(panel).findByText('Nothing expires in the next 30 days.')).toBeInTheDocument();
    });

    it('fails on its own and offers to try again', async () => {
      setup({ shelf: failure() });
      renderDashboard();

      expect(await screen.findByText('Couldn’t load expiry dates')).toBeInTheDocument();
      expect(await screen.findByText('Insulin glargine')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /next step/i })).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument());
    });
  });
});

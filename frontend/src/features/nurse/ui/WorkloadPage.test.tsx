import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth';
import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { renderWithProviders } from '@/test/render';

import { attentionLog, nurseProfile, pageOf, routes, userOf } from '../test-fixtures';
import { WorkloadPage } from './WorkloadPage';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const client = vi.mocked(api, true);

const workload = (assigned: number, capacity = 8) => ({
  assigned,
  capacity,
  atCapacity: assigned >= capacity,
});

interface Setup {
  profile?: unknown;
  workload?: unknown;
  mine?: unknown;
}

function setup({
  profile = nurseProfile({ shift: 'morning' }),
  workload: workloadBody = workload(3),
  mine = pageOf([attentionLog('l1', 'Ada Lovelace', { requiresAttention: false })]),
}: Setup = {}) {
  client.get.mockImplementation(
    routes({ '/nurses/me': profile, '/nurses/me/workload': workloadBody })
  );
  client.page.mockImplementation(routes({ '/care-logs/me': mine }));
}

const entries = () => screen.findByRole('region', { name: /your entries/i });

beforeEach(() => {
  vi.clearAllMocks();
  // 10:00 on a Monday, local time: a morning shift began at 07:00.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 16, 10, 0, 0));
  useAuthStore
    .getState()
    .setSession({ user: userOf('nurse'), accessToken: 'a', refreshToken: 'r' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WorkloadPage', () => {
  it('shows how full the caseload is, at the large size', async () => {
    setup({ workload: workload(3) });
    renderWithProviders(<WorkloadPage />, { route: '/app/workload' });

    expect(screen.getByRole('heading', { name: /^workload$/i, level: 1 })).toBeInTheDocument();
    const meter = await screen.findByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '3');
    expect(meter).toHaveAttribute('aria-valuemax', '8');
    expect(screen.queryByText('At capacity')).not.toBeInTheDocument();
  });

  it('says so, in words, when the nurse is at capacity', async () => {
    setup({ workload: workload(8) });
    renderWithProviders(<WorkloadPage />, { route: '/app/workload' });

    expect(await screen.findByText('At capacity')).toBeInTheDocument();
  });

  it('asks for what the nurse recorded since this shift began', async () => {
    setup();
    renderWithProviders(<WorkloadPage />, { route: '/app/workload' });

    const section = await entries();
    expect(await within(section).findByRole('heading', { name: 'This shift' })).toBeInTheDocument();
    await within(section).findByText('Ada Lovelace');
    expect(client.page).toHaveBeenCalledWith(
      '/care-logs/me',
      expect.objectContaining({
        params: expect.objectContaining({ from: new Date(2026, 10, 16, 7).toISOString() }),
      })
    );
  });

  it('falls back to the last twelve hours for a nurse with no fixed shift', async () => {
    setup({ profile: nurseProfile({ shift: 'on_call' }) });
    renderWithProviders(<WorkloadPage />, { route: '/app/workload' });

    const section = await entries();
    expect(await within(section).findByRole('heading', { name: 'Last 12 hours' })).toBeInTheDocument();
    await within(section).findByText('Ada Lovelace');
    expect(client.page).toHaveBeenCalledWith(
      '/care-logs/me',
      expect.objectContaining({
        params: expect.objectContaining({ from: new Date(2026, 10, 15, 22).toISOString() }),
      })
    );
  });

  it('still lists entries, over the last twelve hours, if the profile cannot be loaded', async () => {
    client.get.mockImplementation(
      routes({
        '/nurses/me': () => {
          throw new ApiError('SERVER_ERROR', 'boom', 500);
        },
        '/nurses/me/workload': workload(3),
      })
    );
    client.page.mockImplementation(routes({ '/care-logs/me': pageOf([attentionLog('l1', 'Ada Lovelace')]) }));
    renderWithProviders(<WorkloadPage />, { route: '/app/workload' });

    const section = await entries();
    expect(await within(section).findByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(section).getByRole('heading', { name: 'Last 12 hours' })).toBeInTheDocument();
  });

  it('lists the entries with their patient and notes, and no way to acknowledge them', async () => {
    setup({
      mine: pageOf([
        attentionLog('l1', 'Ada Lovelace', { notes: 'Pain eased after dose', requiresAttention: true }),
      ]),
    });
    renderWithProviders(<WorkloadPage />, { route: '/app/workload' });

    const section = await entries();
    const link = await within(section).findByRole('link', { name: 'Ada Lovelace' });
    expect(link).toHaveAttribute('href', '/app/patients/p-l1');
    expect(within(section).getByText('Pain eased after dose')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /acknowledge/i })).not.toBeInTheDocument();
  });

  it('narrows the entries to one type', async () => {
    setup();
    renderWithProviders(<WorkloadPage />, { route: '/app/workload' });
    await screen.findByText('Ada Lovelace');

    await userEvent.selectOptions(screen.getByLabelText(/^type$/i), 'vitals');

    await vi.waitFor(() =>
      expect(client.page).toHaveBeenCalledWith(
        '/care-logs/me',
        expect.objectContaining({ params: expect.objectContaining({ type: 'vitals' }) })
      )
    );
  });

  it('says when nothing has been recorded yet this shift', async () => {
    setup({ mine: pageOf([]) });
    renderWithProviders(<WorkloadPage />, { route: '/app/workload' });

    expect(await screen.findByText('Nothing recorded this shift yet.')).toBeInTheDocument();
  });

  it('shows placeholders while loading', () => {
    client.get.mockReturnValue(new Promise(() => {}));
    client.page.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<WorkloadPage />, { route: '/app/workload' });

    expect(screen.getByRole('status', { name: /loading your entries/i })).toBeInTheDocument();
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  });

  it('offers a retry for the patient count without losing the entries', async () => {
    setup({
      workload: () => {
        throw new ApiError('SERVER_ERROR', 'boom', 500);
      },
    });
    renderWithProviders(<WorkloadPage />, { route: '/app/workload' });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('offers a retry for the entries without losing the patient count', async () => {
    setup({
      mine: () => {
        throw new ApiError('SERVER_ERROR', 'boom', 500);
      },
    });
    renderWithProviders(<WorkloadPage />, { route: '/app/workload' });

    const section = await entries();
    const alert = await within(section).findByRole('alert');
    expect(within(alert).getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(await screen.findByRole('meter')).toBeInTheDocument();
  });
});

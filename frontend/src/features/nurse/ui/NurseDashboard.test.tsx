import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { api } from '@/shared/api/client';
import { useToastStore } from '@/shared/ui';
import { renderWithProviders } from '@/test/render';

import {
  attentionLog,
  caseloadPatient,
  nurseProfile,
  pageOf,
  routes,
  userOf,
} from '../test-fixtures';
import { NurseDashboard } from './NurseDashboard';

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
  profile?: Record<string, unknown>;
  workload?: unknown;
  caseload?: unknown;
  attention?: unknown | ((config?: { params?: Record<string, unknown> }) => unknown);
}

function setup({
  profile = nurseProfile(),
  workload: workloadBody = workload(2),
  caseload = pageOf([
    caseloadPatient('1', 'Ada Lovelace'),
    caseloadPatient('2', 'Grace Hopper', { bed: null, ward: 'Ward B' }),
  ]),
  attention = pageOf([attentionLog('a1', 'Ada Lovelace')]),
}: Setup = {}) {
  client.get.mockImplementation(
    routes({ '/nurses/me': profile, '/nurses/me/workload': workloadBody })
  );
  client.page.mockImplementation(
    routes({ '/patients/caseload': caseload, '/care-logs/attention': attention })
  );
}

function renderDashboard() {
  return renderWithProviders(<NurseDashboard name="Nia Okafor" />, { route: '/app' });
}

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  useAuthStore
    .getState()
    .setSession({ user: userOf('nurse'), accessToken: 'a', refreshToken: 'r' });
});

describe('NurseDashboard', () => {
  it('shows skeletons shaped like the final layout while loading', () => {
    client.get.mockReturnValue(new Promise(() => {}));
    client.page.mockReturnValue(new Promise(() => {}));

    renderDashboard();

    expect(screen.getByRole('status', { name: /loading your patients/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /good to see you, nia/i })).toBeInTheDocument();
  });

  it('shows the caseload with name, bed and ward, linking to the chart', async () => {
    setup();
    renderDashboard();

    const panel = screen.getByRole('region', { name: /my patients/i });
    const ada = await within(panel).findByRole('link', { name: /ada lovelace/i });
    expect(ada).toHaveAttribute('href', '/app/patients/1');
    expect(within(ada).getByText('Bed 121 · Ward A')).toBeInTheDocument();
    // No bed: the ward alone is better than nothing.
    expect(within(within(panel).getByRole('link', { name: /grace hopper/i })).getByText('Ward B')).toBeInTheDocument();
  });

  it('draws the capacity bar from the workload endpoint', async () => {
    setup({ workload: workload(6) });
    renderDashboard();

    const meter = await screen.findByRole('meter', { name: /your patients/i });
    expect(meter).toHaveAttribute('aria-valuenow', '6');
    expect(meter).toHaveAttribute('aria-valuemax', '8');
    expect(screen.getByText('Your patients: 6 of 8')).toBeInTheDocument();
    expect(screen.queryByText('At capacity')).not.toBeInTheDocument();
  });

  it('says "At capacity" when the caseload is full', async () => {
    setup({ workload: workload(8) });
    renderDashboard();

    expect(await screen.findByText('At capacity')).toBeInTheDocument();
  });

  it('asks for as many patients as the nurse can hold, so a full caseload fits on one page', async () => {
    setup({ workload: workload(2, 11) });
    renderDashboard();

    await within(screen.getByRole('region', { name: /my patients/i })).findByRole('link', {
      name: /ada lovelace/i,
    });

    expect(client.page).toHaveBeenCalledWith(
      '/patients/caseload',
      expect.objectContaining({ params: expect.objectContaining({ limit: 11 }) })
    );
  });

  it('invites the charge nurse conversation when nobody is assigned', async () => {
    setup({ workload: workload(0), caseload: pageOf([]) });
    renderDashboard();

    expect(await screen.findByText('No patients assigned to you yet.')).toBeInTheDocument();
    expect(screen.getByText(/the charge nurse assigns patients/i)).toBeInTheDocument();
  });

  it('shows what needs attention, with the patient named', async () => {
    setup();
    renderDashboard();

    const panel = screen.getByRole('region', { name: /needs attention/i });
    expect(await within(panel).findByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(panel).getByText(/breathing looks laboured/i)).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /acknowledge/i })).toBeInTheDocument();
  });

  it('says nothing needs a second look when the queue is empty', async () => {
    setup({ attention: pageOf([]) });
    renderDashboard();

    expect(await screen.findByText('Nothing needs a second look.')).toBeInTheDocument();
  });

  it('scopes the queue to the nurse’s ward', async () => {
    setup({ profile: nurseProfile({ assignedWards: ['Ward A'] }) });
    renderDashboard();

    await waitFor(() =>
      expect(client.page).toHaveBeenCalledWith(
        '/care-logs/attention',
        expect.objectContaining({ params: expect.objectContaining({ ward: 'Ward A' }) })
      )
    );
  });

  it('asks once per ward for a nurse on two wards, and merges the answers newest first', async () => {
    setup({
      profile: nurseProfile({ assignedWards: ['Ward A', 'Ward B'] }),
      attention: (config?: { params?: Record<string, unknown> }) =>
        config?.params?.ward === 'Ward A'
          ? pageOf([attentionLog('a1', 'Older Patient', { performedAt: '2026-11-16T06:00:00.000Z' })])
          : pageOf([attentionLog('b1', 'Newer Patient', { performedAt: '2026-11-16T09:00:00.000Z' })]),
    });
    renderDashboard();

    const panel = await screen.findByRole('region', { name: /needs attention/i });
    await within(panel).findByText('Older Patient');
    const names = within(panel)
      .getAllByText(/patient$/i)
      .map((node) => node.textContent);
    expect(names).toEqual(['Newer Patient', 'Older Patient']);
  });

  it('shows a float nurse the hospital-wide queue, with no ward filter', async () => {
    setup({ profile: nurseProfile({ assignedWards: [] }) });
    renderDashboard();

    await screen.findByRole('region', { name: /needs attention/i });
    await waitFor(() => {
      const attentionCalls = client.page.mock.calls.filter(([path]) => path === '/care-logs/attention');
      expect(attentionCalls).toHaveLength(1);
      expect((attentionCalls[0]?.[1] as { params: Record<string, unknown> }).params.ward).toBeUndefined();
    });
  });

  it('acknowledges an entry, disabling its button while the request runs', async () => {
    setup();
    let finish: (value: unknown) => void = () => {};
    client.post.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    renderDashboard();

    const button = await screen.findByRole('button', { name: /acknowledge/i });
    await user.click(button);

    expect(client.post).toHaveBeenCalledWith('/care-logs/a1/acknowledge');
    await waitFor(() => expect(button).toBeDisabled());

    finish({ id: 'a1' });
    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((toast) => toast.title)).toContain(
        'Entry acknowledged'
      )
    );
  });

  it('tells the nurse when a colleague got there first', async () => {
    setup();
    client.post.mockRejectedValue(
      new ApiError('ALREADY_ACKNOWLEDGED', 'Already acknowledged', 409)
    );
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: /acknowledge/i }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((toast) => toast.title)).toContain(
        'Already picked up by a colleague'
      )
    );
  });

  it('shows the duty switch on, with no off-duty note', async () => {
    setup();
    renderDashboard();

    const toggle = await screen.findByRole('switch', { name: /on duty/i });
    expect(toggle).toBeChecked();
    expect(screen.queryByText(/can’t hand over to you/i)).not.toBeInTheDocument();
  });

  it('explains what being off duty means for handovers', async () => {
    setup({ profile: nurseProfile({ isOnDuty: false }) });
    renderDashboard();

    const toggle = await screen.findByRole('switch', { name: /off duty/i });
    expect(toggle).not.toBeChecked();
    expect(
      screen.getByText('Colleagues can’t hand over to you while you’re off duty.')
    ).toBeInTheDocument();
  });

  it('changes duty status from the switch', async () => {
    setup({ profile: nurseProfile({ isOnDuty: false }) });
    client.patch.mockResolvedValue(nurseProfile({ isOnDuty: true }));
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('switch', { name: /off duty/i }));

    expect(client.patch).toHaveBeenCalledWith('/nurses/me/duty', { isOnDuty: true });
    expect(await screen.findByRole('switch', { name: /on duty/i })).toBeChecked();
  });

  it('says what happened and offers a retry when the caseload fails to load', async () => {
    setup({
      caseload: () => {
        throw new ApiError('INTERNAL_ERROR', 'boom', 500);
      },
    });
    renderDashboard();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/couldn’t load your patients/i)).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

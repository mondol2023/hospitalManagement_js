import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth';
import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { useToastStore } from '@/shared/ui';
import { renderWithProviders } from '@/test/render';

import { attentionLog, nurseProfile, pageOf, routes, userOf } from '../test-fixtures';
import { WardPage } from './WardPage';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const client = vi.mocked(api, true);

const WARD_A = '/care-logs/ward/Ward%20A';
const WARD_B = '/care-logs/ward/Ward%20B';

type Config = { params?: Record<string, unknown> };

interface Setup {
  profile?: Record<string, unknown>;
  wards?: string[];
  feed?: Record<string, unknown>;
  attention?: unknown;
}

function setup({
  profile = nurseProfile({ assignedWards: ['Ward A', 'Ward B'] }),
  wards = ['Ward A', 'Ward B', 'Ward C'],
  feed = {},
  attention = pageOf([attentionLog('a1', 'Ada Lovelace')]),
}: Setup = {}) {
  client.get.mockImplementation(routes({ '/nurses/me': profile, '/beds/wards': wards }));
  client.page.mockImplementation(
    routes({
      [WARD_A]: pageOf([
        attentionLog('f1', 'Ada Lovelace', { requiresAttention: false, notes: 'Settled after tea' }),
        attentionLog('f2', 'Grace Hopper', {
          type: 'vitals',
          requiresAttention: false,
          notes: 'Obs stable',
        }),
      ]),
      [WARD_B]: pageOf([attentionLog('g1', 'Bea Arthur', { ward: 'Ward B', requiresAttention: false })]),
      '/care-logs/attention': attention,
      ...feed,
    })
  );
}

function renderWard(route = '/app/ward') {
  return renderWithProviders(<WardPage />, { route });
}

const feedCalls = (path: string) =>
  client.page.mock.calls.filter(([called]) => called === path) as Array<[string, Config]>;

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  useAuthStore
    .getState()
    .setSession({ user: userOf('nurse'), accessToken: 'a', refreshToken: 'r' });
});

describe('WardPage', () => {
  it('shows skeletons while the first answers are on their way', () => {
    client.get.mockReturnValue(new Promise(() => {}));
    client.page.mockReturnValue(new Promise(() => {}));

    renderWard();

    expect(screen.getByRole('heading', { name: /ward/i })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /loading the ward feed/i })).toBeInTheDocument();
  });

  it('opens on the nurse’s first assigned ward', async () => {
    setup();
    renderWard();

    const feed = await screen.findByRole('region', { name: /ward feed/i });
    expect(await within(feed).findByText('Settled after tea')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /ward/i })).toHaveValue('Ward A');
    expect(feedCalls(WARD_B)).toHaveLength(0);
    expect(feedCalls('/care-logs/attention')).toHaveLength(0);
  });

  it('names the patient, the kind of entry and who wrote it', async () => {
    setup();
    renderWard();

    const feed = await screen.findByRole('region', { name: /ward feed/i });
    await within(feed).findByText('Settled after tea');
    expect(within(feed).getByRole('link', { name: 'Grace Hopper' })).toHaveAttribute(
      'href',
      '/app/patients/p-f2'
    );
    expect(within(feed).getByText('Vitals')).toBeInTheDocument();
    expect(within(feed).getAllByText(/Sam Reyes/).length).toBeGreaterThan(0);
  });

  it('lets the link choose the ward', async () => {
    setup();
    renderWard('/app/ward?ward=Ward%20B');

    expect(await screen.findByText('Bea Arthur')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /ward/i })).toHaveValue('Ward B');
    expect(feedCalls(WARD_A)).toHaveLength(0);
  });

  it('falls back to the first ward on the estate for a float nurse', async () => {
    setup({ profile: nurseProfile({ assignedWards: [] }) });
    renderWard();

    expect(await screen.findByText('Settled after tea')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /ward/i })).toHaveValue('Ward A');
  });

  it('switches ward from the picker', async () => {
    setup();
    renderWard();
    await screen.findByText('Settled after tea');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /ward/i }), 'Ward B');

    expect(await screen.findByText('Bea Arthur')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /ward/i })).toHaveValue('Ward B');
  });

  it('filters by the kind of entry', async () => {
    setup();
    renderWard();
    await screen.findByText('Settled after tea');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /type/i }), 'vitals');

    await waitFor(() =>
      expect(feedCalls(WARD_A).some(([, config]) => config.params?.type === 'vitals')).toBe(true)
    );
  });

  it('switches to the attention queue for the ward, where the type filter no longer applies', async () => {
    setup();
    renderWard();
    await screen.findByText('Settled after tea');

    await userEvent.click(screen.getByRole('checkbox', { name: /needs attention/i }));

    const feed = screen.getByRole('region', { name: /ward feed/i });
    expect(await within(feed).findByRole('button', { name: /acknowledge entry for ada/i })).toBeInTheDocument();
    expect(feedCalls('/care-logs/attention')[0]?.[1].params).toEqual(
      expect.objectContaining({ ward: 'Ward A' })
    );
    expect(screen.getByRole('combobox', { name: /type/i })).toBeDisabled();
  });

  it('acknowledges a flagged entry inline', async () => {
    setup({
      feed: {
        [WARD_A]: pageOf([attentionLog('f9', 'Ada Lovelace', { notes: 'Needs a look' })]),
      },
    });
    client.post.mockResolvedValue({});
    renderWard();

    await userEvent.click(
      await screen.findByRole('button', { name: /acknowledge entry for ada lovelace/i })
    );

    expect(client.post).toHaveBeenCalledWith('/care-logs/f9/acknowledge');
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.title === 'Entry acknowledged')).toBe(true)
    );
  });

  it('offers no acknowledge button once somebody has picked an entry up', async () => {
    setup({
      feed: {
        [WARD_A]: pageOf([
          attentionLog('f9', 'Ada Lovelace', {
            acknowledgedBy: { id: 'u-x', name: 'Rina Shah' },
          }),
        ]),
      },
    });
    renderWard();

    await screen.findByText('Breathing looks laboured');
    expect(screen.queryByRole('button', { name: /acknowledge/i })).not.toBeInTheDocument();
    expect(screen.getByText(/acknowledged by rina shah/i)).toBeInTheDocument();
  });

  it('pages through the feed', async () => {
    setup({
      feed: {
        [WARD_A]: pageOf([attentionLog('f1', 'Ada Lovelace')], { total: 45, totalPages: 3 }),
      },
    });
    renderWard();
    await screen.findByText('Breathing looks laboured');

    await userEvent.click(screen.getByRole('button', { name: /next page/i }));

    await waitFor(() =>
      expect(feedCalls(WARD_A).some(([, config]) => config.params?.page === 2)).toBe(true)
    );
  });

  it('says so when the ward is quiet', async () => {
    setup({ feed: { [WARD_A]: pageOf([]) } });
    renderWard();

    expect(await screen.findByText('Nothing recorded on Ward A yet.')).toBeInTheDocument();
  });

  it('says what happened and offers a retry when the feed fails', async () => {
    setup({
      feed: {
        [WARD_A]: () => {
          throw new ApiError('SERVER_ERROR', 'boom', 500);
        },
      },
    });
    renderWard();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/couldn’t load the ward feed/i)).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('explains when there are no wards to show', async () => {
    setup({ profile: nurseProfile({ assignedWards: [] }), wards: [] });
    renderWard();

    expect(await screen.findByText(/no wards have been set up yet/i)).toBeInTheDocument();
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth';
import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { formatDate } from '@/shared/lib/format';
import type { Role } from '@/shared/lib/roles';
import { useToastStore } from '@/shared/ui';
import { renderWithProviders } from '@/test/render';

import { followUp, pageOf, record, routes, userOf } from '../test-fixtures';
import { FollowUpsPage } from './FollowUpsPage';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const client = vi.mocked(api, true);

const LIST = '/medical-records/follow-ups';
type Config = { params?: Record<string, unknown> };

function listRequests() {
  return client.page.mock.calls
    .filter(([path]) => path === LIST)
    .map(([, config]) => (config as Config | undefined)?.params);
}

function signInAs(role: Role) {
  useAuthStore
    .getState()
    .setSession({ user: userOf(role, { id: `u-${role}` }), accessToken: 'a', refreshToken: 'r' });
}

function serve(items = [followUp('f1', 'Ada Lovelace'), followUp('f2', 'Grace Hopper')]) {
  client.page.mockImplementation(
    routes({
      [LIST]: () => pageOf(items),
      '/doctors': pageOf([
        { id: 'dp1', user: { id: 'u-doc', name: 'Dr Imani Khan' } },
        { id: 'dp2', user: { id: 'u-doc2', name: 'Dr Bo Chen' } },
      ]),
    })
  );
  client.get.mockImplementation(
    routes({ '/medical-records/f1': record('f1', 'Ada Lovelace') })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  signInAs('doctor');
  serve();
});

describe('FollowUpsPage', () => {
  it('opens on what is overdue', async () => {
    renderWithProviders(<FollowUpsPage />, { route: '/app/follow-ups' });

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(listRequests()[0]).toEqual({ overdue: true, page: 1, limit: 20 });
    expect(screen.getByRole('tab', { name: /overdue/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows patient, diagnosis, due date and visit date', async () => {
    renderWithProviders(<FollowUpsPage />, { route: '/app/follow-ups' });

    const row = (await screen.findByText('Ada Lovelace')).closest('tr')!;
    expect(within(row).getByText('MRN-p-f1')).toBeInTheDocument();
    expect(within(row).getByText('Hypertension')).toBeInTheDocument();
    expect(within(row).getByText(formatDate('2026-11-24T00:00:00.000Z'))).toBeInTheDocument();
    expect(within(row).getByText(formatDate('2026-11-10T10:00:00.000Z'))).toBeInTheDocument();
  });

  it.each([
    ['Next 7 days', { days: 7, page: 1, limit: 20 }],
    ['Next 30 days', { days: 30, page: 1, limit: 20 }],
  ])('the “%s” tab asks for that window', async (name, params) => {
    renderWithProviders(<FollowUpsPage />, { route: '/app/follow-ups' });
    await screen.findByText('Ada Lovelace');

    await userEvent.click(screen.getByRole('tab', { name }));

    await waitFor(() => expect(listRequests().at(-1)).toEqual(params));
    expect(screen.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the tab in the link', async () => {
    renderWithProviders(<FollowUpsPage />, { route: '/app/follow-ups?tab=30' });

    await screen.findByText('Ada Lovelace');
    expect(listRequests()[0]).toEqual({ days: 30, page: 1, limit: 20 });
    expect(screen.getByRole('tab', { name: 'Next 30 days' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('falls back to overdue for a tab it does not know', async () => {
    renderWithProviders(<FollowUpsPage />, { route: '/app/follow-ups?tab=banana' });

    await screen.findByText('Ada Lovelace');
    expect(listRequests()[0]).toEqual({ overdue: true, page: 1, limit: 20 });
  });

  it('opens the full record from a row', async () => {
    renderWithProviders(<FollowUpsPage />, { route: '/app/follow-ups' });

    await userEvent.click((await screen.findByText('Ada Lovelace')).closest('tr')!);

    expect(await screen.findByRole('dialog', { name: /ada lovelace/i })).toBeInTheDocument();
  });

  it('says what an empty tab means', async () => {
    serve([]);
    renderWithProviders(<FollowUpsPage />, { route: '/app/follow-ups' });

    expect(await screen.findByText(/nobody is overdue/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Next 7 days' }));
    expect(await screen.findByText(/no follow-ups due in the next 7 days/i)).toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    client.page.mockRejectedValueOnce(new ApiError('INTERNAL_ERROR', 'boom', 500));
    renderWithProviders(<FollowUpsPage />, { route: '/app/follow-ups' });

    expect(await screen.findByText(/couldn’t load follow-ups/i)).toBeInTheDocument();

    serve();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('names a patient who has been deleted as unknown', async () => {
    serve([followUp('f1', 'x', { patient: null })]);
    renderWithProviders(<FollowUpsPage />, { route: '/app/follow-ups' });

    expect(await screen.findByText('Unknown patient')).toBeInTheDocument();
  });
});

describe('FollowUpsPage for a doctor', () => {
  it('has no doctor column, no doctor filter and no reminder button', async () => {
    renderWithProviders(<FollowUpsPage />, { route: '/app/follow-ups' });

    await screen.findByText('Ada Lovelace');
    expect(screen.queryByRole('columnheader', { name: 'Doctor' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^doctor$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send reminders/i })).not.toBeInTheDocument();
    // …and never asks for the directory of doctors.
    expect(client.page.mock.calls.some(([path]) => path === '/doctors')).toBe(false);
  });
});

describe.each(['admin', 'manager'] as Role[])('FollowUpsPage for a %s', (role) => {
  beforeEach(() => signInAs(role));

  it('adds a doctor column', async () => {
    renderWithProviders(<FollowUpsPage />, { route: '/app/follow-ups' });

    const row = (await screen.findByText('Ada Lovelace')).closest('tr')!;
    expect(screen.getByRole('columnheader', { name: 'Doctor' })).toBeInTheDocument();
    expect(within(row).getByText('Dr Imani Khan')).toBeInTheDocument();
  });

  it('filters by doctor, and starts over at page one', async () => {
    renderWithProviders(<FollowUpsPage />, { route: '/app/follow-ups' });
    await screen.findByText('Ada Lovelace');

    await userEvent.selectOptions(await screen.findByLabelText(/^doctor$/i), 'u-doc2');

    await waitFor(() =>
      expect(listRequests().at(-1)).toEqual({
        overdue: true,
        doctorId: 'u-doc2',
        page: 1,
        limit: 20,
      })
    );
  });

  it('sends reminders only after a confirmation, and reports who was reached', async () => {
    client.post.mockResolvedValue({ due: 5, sent: 4 });
    renderWithProviders(<FollowUpsPage />, { route: '/app/follow-ups' });
    await screen.findByText('Ada Lovelace');

    await userEvent.click(screen.getByRole('button', { name: /send reminders/i }));
    const dialog = await screen.findByRole('dialog');
    expect(client.post).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent(/tomorrow/i);

    await userEvent.click(within(dialog).getByRole('button', { name: /send reminders/i }));

    await waitFor(() =>
      expect(client.post).toHaveBeenCalledWith('/medical-records/follow-ups/remind', undefined, {
        params: { days: 1 },
      })
    );
    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((t) => t.title)).toContain(
        '4 of 5 patients notified'
      )
    );
  });

  it('sends nothing when the confirmation is declined', async () => {
    renderWithProviders(<FollowUpsPage />, { route: '/app/follow-ups' });
    await screen.findByText('Ada Lovelace');

    await userEvent.click(screen.getByRole('button', { name: /send reminders/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /cancel|not now/i }));

    expect(client.post).not.toHaveBeenCalled();
  });
});

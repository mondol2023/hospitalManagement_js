import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth';
import { api } from '@/shared/api/client';
import type * as ClientModule from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { useToastStore } from '@/shared/ui';
import { renderWithProviders } from '@/test/render';

import { agendaRow, routes, userOf } from '../test-fixtures';
import { SchedulePage } from './SchedulePage';

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const client = vi.mocked(api, true);

const DAY_PATH = '/appointments/doctor/u-doc/day';
type Config = { params?: Record<string, unknown> };

function dayRequests(): Array<Record<string, unknown> | undefined> {
  return client.get.mock.calls
    .filter(([path]) => path === DAY_PATH)
    .map(([, config]) => (config as Config | undefined)?.params);
}

function serve(rows: unknown[] | ((config?: Config) => unknown) = []) {
  client.get.mockImplementation(
    routes({ [DAY_PATH]: typeof rows === 'function' ? rows : () => rows })
  );
}

const TODAY = '2026-11-21';

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  // Only the clock is faked, so promises, timers and user-event keep working.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-21T08:50:00.000Z') });
  useAuthStore
    .getState()
    .setSession({ user: userOf('doctor'), accessToken: 'a', refreshToken: 'r' });
  serve([agendaRow('a1', 'Ada Lovelace'), agendaRow('a2', 'Grace Hopper', { status: 'pending' })]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SchedulePage', () => {
  it('opens on today and lists the day with patient, MRN, reason and status', async () => {
    renderWithProviders(<SchedulePage />, { route: '/app/schedule' });

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(dayRequests()[0]).toEqual({ date: TODAY });
    expect(screen.getByText('MRN-p-a1')).toBeInTheDocument();
    expect(screen.getAllByText('Blood pressure review')).toHaveLength(2);
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('opens the day named in the link', async () => {
    renderWithProviders(<SchedulePage />, { route: '/app/schedule?date=2026-12-03' });

    await screen.findByText('Ada Lovelace');
    expect(dayRequests()[0]).toEqual({ date: '2026-12-03' });
  });

  it('opens today when the date in the link is not a real day', async () => {
    renderWithProviders(<SchedulePage />, { route: '/app/schedule?date=2026-02-30' });

    await screen.findByText('Ada Lovelace');
    expect(dayRequests()[0]).toEqual({ date: TODAY });
  });

  it('steps a day at a time, and “Today” brings the doctor back', async () => {
    renderWithProviders(<SchedulePage />, { route: '/app/schedule' });
    await screen.findByText('Ada Lovelace');

    await userEvent.click(screen.getByRole('button', { name: /next day/i }));
    await waitFor(() => expect(dayRequests().at(-1)).toEqual({ date: '2026-11-22' }));

    await userEvent.click(screen.getByRole('button', { name: /previous day/i }));
    await userEvent.click(screen.getByRole('button', { name: /previous day/i }));
    await waitFor(() => expect(dayRequests().at(-1)).toEqual({ date: '2026-11-20' }));

    await userEvent.click(screen.getByRole('button', { name: /^today$/i }));
    await waitFor(() => expect(dayRequests().at(-1)).toEqual({ date: TODAY }));
  });

  it('asks for finished visits only when “Show finished” is on', async () => {
    renderWithProviders(<SchedulePage />, { route: '/app/schedule' });
    await screen.findByText('Ada Lovelace');

    await userEvent.click(screen.getByRole('checkbox', { name: /show finished/i }));

    await waitFor(() => expect(dayRequests().at(-1)).toEqual({ date: TODAY, includeClosed: true }));
  });

  it('marks the visit that is next, in words', async () => {
    renderWithProviders(<SchedulePage />, { route: '/app/schedule' });

    // 08:50 now; Ada is booked for 09:00.
    const row = (await screen.findByText('Ada Lovelace')).closest('li')!;
    expect(within(row).getByText(/up next/i)).toBeInTheDocument();
    const other = screen.getByText('Grace Hopper').closest('li')!;
    expect(within(other).queryByText(/up next|now/i)).not.toBeInTheDocument();
  });

  it('marks nothing on a day that is not today', async () => {
    renderWithProviders(<SchedulePage />, { route: '/app/schedule?date=2026-11-20' });

    await screen.findByText('Ada Lovelace');
    expect(screen.queryByText(/up next/i)).not.toBeInTheDocument();
  });

  it('shows what each visit can do', async () => {
    renderWithProviders(<SchedulePage />, { route: '/app/schedule' });

    const row = (await screen.findByText('Ada Lovelace')).closest('li')!;
    expect(within(row).getByRole('button', { name: 'Complete' })).toBeInTheDocument();
    const pending = screen.getByText('Grace Hopper').closest('li')!;
    expect(within(pending).getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('names a deleted patient instead of crashing', async () => {
    serve([agendaRow('a1', 'x', { patient: 'p-gone' as never })]);
    renderWithProviders(<SchedulePage />, { route: '/app/schedule' });

    expect(await screen.findByText('Unknown patient')).toBeInTheDocument();
  });

  it('shows a skeleton while the day loads', () => {
    client.get.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<SchedulePage />, { route: '/app/schedule' });

    expect(screen.getByRole('status', { name: /loading the day/i })).toBeInTheDocument();
  });

  it('says so when nothing is booked, and points at the finished toggle', async () => {
    serve([]);
    renderWithProviders(<SchedulePage />, { route: '/app/schedule' });

    expect(await screen.findByText(/nothing left on this day/i)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows an error with a retry when the day cannot be loaded', async () => {
    client.get.mockRejectedValueOnce(new ApiError('INTERNAL_ERROR', 'boom', 500));
    renderWithProviders(<SchedulePage />, { route: '/app/schedule' });

    expect(await screen.findByText(/couldn’t load your day/i)).toBeInTheDocument();

    serve([agendaRow('a1', 'Ada Lovelace')]);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
  });
});

describe('SchedulePage after Complete', () => {
  it('offers to record the consultation for the visit just completed', async () => {
    const onRecord = vi.fn();
    client.post.mockResolvedValue({});
    renderWithProviders(<SchedulePage onRecordConsultation={onRecord} />, {
      route: '/app/schedule',
    });

    const row = (await screen.findByText('Ada Lovelace')).closest('li')!;
    // The refetch after completing drops the visit from an open-only day.
    serve([agendaRow('a2', 'Grace Hopper', { status: 'pending' })]);
    await userEvent.click(within(row).getByRole('button', { name: 'Complete' }));

    const prompt = await screen.findByRole('status', { name: /visit completed/i });
    expect(prompt).toHaveTextContent('Ada Lovelace');
    await userEvent.click(within(prompt).getByRole('button', { name: /record consultation/i }));

    expect(onRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });

  it('lets the doctor dismiss the prompt', async () => {
    client.post.mockResolvedValue({});
    renderWithProviders(<SchedulePage onRecordConsultation={vi.fn()} />, {
      route: '/app/schedule',
    });

    const row = (await screen.findByText('Ada Lovelace')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Complete' }));
    const prompt = await screen.findByRole('status', { name: /visit completed/i });
    await userEvent.click(within(prompt).getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByRole('status', { name: /visit completed/i })).not.toBeInTheDocument();
  });

  it('shows no prompt when the visit could not be completed', async () => {
    client.post.mockRejectedValue(new ApiError('INVALID_STATE', 'Nope', 409));
    renderWithProviders(<SchedulePage onRecordConsultation={vi.fn()} />, {
      route: '/app/schedule',
    });

    const row = (await screen.findByText('Ada Lovelace')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Complete' }));

    await waitFor(() => expect(client.post).toHaveBeenCalled());
    expect(screen.queryByRole('status', { name: /visit completed/i })).not.toBeInTheDocument();
  });

  // The consultation form is a separate screen; until it is wired in, a prompt
  // with a dead button would be worse than none.
  it('offers no prompt when there is nowhere to record it yet', async () => {
    client.post.mockResolvedValue({});
    renderWithProviders(<SchedulePage />, { route: '/app/schedule' });

    const row = (await screen.findByText('Ada Lovelace')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Complete' }));

    await waitFor(() => expect(client.post).toHaveBeenCalled());
    expect(screen.queryByRole('status', { name: /visit completed/i })).not.toBeInTheDocument();
  });
});

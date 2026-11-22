import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { toast } from '@/shared/ui';
import { renderHookWithClient } from '@/test/render';

import {
  useMyBills,
  useMyCareTeam,
  useMyJourney,
  useMyLatestVitals,
  useMyOpenBills,
  useNextAppointments,
  useOpenCareTeamChat,
} from './use-patient-portal';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn() },
}));
vi.mock('@/shared/ui', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const page = <T,>(items: T[], pageNo = 1, totalPages = 1) => ({
  items,
  pagination: { page: pageNo, limit: 20, total: items.length, totalPages },
});

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.page).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(toast.error).mockReset();
});

describe('read hooks use the me routes', () => {
  it('reads the care team from /patients/me/care-team', async () => {
    vi.mocked(api.get).mockResolvedValue({ primaryDoctor: null, nurses: [] });
    const { result } = renderHookWithClient(() => useMyCareTeam());

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(api.get).toHaveBeenCalledWith('/patients/me/care-team');
  });

  it('asks for upcoming visits, not a client-side filter', async () => {
    vi.mocked(api.page).mockResolvedValue(page([]));
    const { result } = renderHookWithClient(() => useNextAppointments());

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(api.page).toHaveBeenCalledWith('/appointments', {
      params: { upcoming: true, limit: 3 },
    });
  });

  it('asks for the latest record that has vitals', async () => {
    vi.mocked(api.get).mockResolvedValue(null);
    const { result } = renderHookWithClient(() => useMyLatestVitals());

    await waitFor(() => expect(result.current.data).toBeNull());

    expect(api.get).toHaveBeenCalledWith('/medical-records/patient/me/latest', {
      params: { withVitals: true },
    });
  });

  it('reads open bills from /bills/patient/me, never /bills', async () => {
    vi.mocked(api.page).mockResolvedValue(page([]));
    const { result } = renderHookWithClient(() => useMyOpenBills());

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(api.page).toHaveBeenCalledWith('/bills/patient/me', {
      params: { open: true, limit: 50 },
    });
  });

  it('passes the Billing tab through to /bills/patient/me', async () => {
    vi.mocked(api.page).mockResolvedValue(page([]));
    const { result } = renderHookWithClient(() => useMyBills({ page: 2, limit: 10 }));

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(api.page).toHaveBeenCalledWith('/bills/patient/me', { params: { page: 2, limit: 10 } });
  });
});

describe('useMyJourney', () => {
  it('pages the chart 20 at a time and stops at the last page', async () => {
    vi.mocked(api.page)
      .mockResolvedValueOnce(page([{ id: 'r1' }], 1, 2))
      .mockResolvedValueOnce(page([{ id: 'r2' }], 2, 2));
    const { result } = renderHookWithClient(() => useMyJourney());

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(api.page).toHaveBeenLastCalledWith('/medical-records/patient/me', {
      params: { page: 1, limit: 20 },
    });
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(api.page).toHaveBeenLastCalledWith('/medical-records/patient/me', {
      params: { page: 2, limit: 20 },
    });
    expect(result.current.data?.pages.flatMap((p) => p.items)).toEqual([
      { id: 'r1' },
      { id: 'r2' },
    ]);
    expect(result.current.hasNextPage).toBe(false);
  });
});

describe('useOpenCareTeamChat', () => {
  it('opens the thread by the real patient id and stays silent on success', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'c1' });
    const { result } = renderHookWithClient(() => useOpenCareTeamChat());

    await act(() => result.current.mutateAsync('p1'));

    expect(api.post).toHaveBeenCalledWith('/chat/care-team/p1', {});
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('reports NO_CARE_TEAM in place, without a toast', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError('NO_CARE_TEAM', 'No care team', 400));
    const { result } = renderHookWithClient(() => useOpenCareTeamChat());

    await act(() => result.current.mutateAsync('p1').catch(() => undefined));

    await waitFor(() => expect(result.current.noCareTeam).toBe(true));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('toasts any other failure', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', 500));
    const { result } = renderHookWithClient(() => useOpenCareTeamChat());

    await act(() => result.current.mutateAsync('p1').catch(() => undefined));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't open the conversation. Try again in a moment."
      )
    );
    expect(result.current.noCareTeam).toBe(false);
  });
});

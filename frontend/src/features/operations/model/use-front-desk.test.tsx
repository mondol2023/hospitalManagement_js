import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { toast } from '@/shared/ui';
import { renderHookWithClient } from '@/test/render';

import { useArrivals, useConfirmArrival, usePatientByMrn } from './use-front-desk';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), page: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

const EMPTY_PAGE = { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
const DAY = { from: '2026-11-21T18:00:00.000Z', to: '2026-11-22T17:59:59.999Z' };

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.page).mockReset().mockResolvedValue(EMPTY_PAGE);
  vi.spyOn(toast, 'success').mockImplementation(() => '');
  vi.spyOn(toast, 'info').mockImplementation(() => '');
  vi.spyOn(toast, 'error').mockImplementation(() => '');
});

describe('usePatientByMrn', () => {
  // The lookup is submitted, not typed: one misread character fetches someone
  // else's record, so nothing may fire until there is a submitted MRN.
  it('does not fetch until an MRN has been submitted', () => {
    renderHookWithClient(() => usePatientByMrn(''));
    renderHookWithClient(() => usePatientByMrn('   '));

    expect(api.get).not.toHaveBeenCalled();
  });

  it('looks the patient up by MRN', async () => {
    vi.mocked(api.get).mockResolvedValue({ id: 'p1', medicalRecordNumber: 'MRN-004213' });
    const { result } = renderHookWithClient(() => usePatientByMrn('MRN-004213'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/patients/mrn/MRN-004213');
  });

  // The desk types what is on a wristband. The server normalises too, but
  // normalising here means "mrn-004213" and "MRN-004213" share one cache entry.
  it('accepts any case and stray spaces', async () => {
    vi.mocked(api.get).mockResolvedValue({ id: 'p1' });
    const { result } = renderHookWithClient(() => usePatientByMrn('  mrn-004213 '));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/patients/mrn/MRN-004213');
  });

  // The page tells "no patient with that MRN" (404) from a failed request by status.
  it('exposes an unknown MRN as an error carrying its 404', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError('NOT_FOUND', 'No such patient', 404));
    const { result } = renderHookWithClient(() => usePatientByMrn('MRN-000000'));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as ApiError).status).toBe(404);
  });

  it('caches under the patients prefix, so a bed or discharge change refreshes it', () => {
    expect(queryKeys.patients.byMrn('MRN-1').slice(0, 1)).toEqual(queryKeys.patients.all);
  });
});

describe('useArrivals', () => {
  it('asks for the day’s visits in time order, twenty at a time', async () => {
    const { result } = renderHookWithClient(() => useArrivals(DAY, {}));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.page).toHaveBeenCalledWith('/appointments', {
      params: { ...DAY, limit: 20, sort: 'scheduledAt', page: 1 },
    });
  });

  it('passes the status, doctor and page filters through', async () => {
    const { result } = renderHookWithClient(() =>
      useArrivals(DAY, { status: 'pending', doctor: 'd1', page: 2 })
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.page).toHaveBeenCalledWith('/appointments', {
      params: { ...DAY, limit: 20, sort: 'scheduledAt', status: 'pending', doctor: 'd1', page: 2 },
    });
  });

  // Switching "Waiting" to "Confirmed" must not flash the other filter's rows.
  it('gives each filter its own cache entry', async () => {
    const { result, client } = renderHookWithClient(() => useArrivals(DAY, { status: 'pending' }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = client
      .getQueryCache()
      .getAll()
      .map((query) => JSON.stringify(query.queryKey));

    expect(keys.some((key) => key.includes('"pending"'))).toBe(true);
    expect(keys.every((key) => key.startsWith('["appointments"'))).toBe(true);
  });

  it('refreshes every minute while the tab is visible', async () => {
    const { result, client } = renderHookWithClient(() => useArrivals(DAY, {}));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [query] = client.getQueryCache().getAll();
    const options = query!.observers[0]!.options;

    expect(options.refetchInterval).toBe(60_000);
    // TanStack's default: no polling for a tab nobody is looking at.
    expect(options.refetchIntervalInBackground ?? false).toBe(false);
  });
});

describe('useConfirmArrival', () => {
  it('confirms the visit, refreshes appointments and names the patient', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'a1', status: 'confirmed' });
    const { result, client } = renderHookWithClient(() => useConfirmArrival());
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(() => result.current.mutateAsync({ id: 'a1', patientName: 'Amina Yusuf' }));

    expect(api.post).toHaveBeenCalledWith('/appointments/a1/confirm');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.appointments.all });
    expect(toast.success).toHaveBeenCalledWith('Visit confirmed for Amina Yusuf');
  });

  it('says "Visit confirmed" alone when the row has no name on record', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'a1' });
    const { result } = renderHookWithClient(() => useConfirmArrival());

    await act(() => result.current.mutateAsync({ id: 'a1' }));

    expect(toast.success).toHaveBeenCalledWith('Visit confirmed');
  });

  // Someone else moved the visit on first. Not an error: say so and show the truth.
  it('treats a 409 as "a colleague got there first": info toast and a refetch', async () => {
    vi.mocked(api.post).mockRejectedValue(
      new ApiError('INVALID_STATE_TRANSITION', 'An appointment cannot move from confirmed', 409)
    );
    const { result, client } = renderHookWithClient(() => useConfirmArrival());
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(async () => {
      await result.current.mutateAsync({ id: 'a1', patientName: 'Amina Yusuf' }).catch(() => undefined);
    });

    expect(toast.info).toHaveBeenCalledWith('Already updated by a colleague');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.appointments.all });
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('reports any other failure as an error and leaves the list alone', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', 500));
    const { result, client } = renderHookWithClient(() => useConfirmArrival());
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(async () => {
      await result.current.mutateAsync({ id: 'a1' }).catch(() => undefined);
    });

    expect(toast.error).toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });
});

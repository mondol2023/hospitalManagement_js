import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { toast } from '@/shared/ui';
import { renderHookWithClient } from '@/test/render';

import { useWithdrawExpired } from './use-medicines';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), page: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

function item(id: string, quantity: number) {
  return {
    id,
    name: `Medicine ${id}`,
    batchNumber: `B-${id}`,
    quantity,
    unit: 'tablet',
    expiryDate: '2026-11-02T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.mocked(api.post).mockReset();
  vi.spyOn(toast, 'success').mockImplementation(() => '');
  vi.spyOn(toast, 'info').mockImplementation(() => '');
  vi.spyOn(toast, 'error').mockImplementation(() => '');
});

describe('useWithdrawExpired', () => {
  it('sweeps the shelf and returns what the server actually wrote off', async () => {
    const written = { withdrawn: 2, units: 310, items: [item('a', 120), item('b', 190)] };
    vi.mocked(api.post).mockResolvedValue(written);
    const { result } = renderHookWithClient(() => useWithdrawExpired());

    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync();
    });

    expect(api.post).toHaveBeenCalledWith('/medicines/withdraw-expired', {});
    expect(returned).toEqual(written);
  });

  // Stock is read through several lenses, and the live board's low-stock count
  // is one of them: a write-off moves it.
  it('refreshes medicines and the live board', async () => {
    vi.mocked(api.post).mockResolvedValue({ withdrawn: 1, units: 5, items: [item('a', 5)] });
    const { result, client } = renderHookWithClient(() => useWithdrawExpired());
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(() => result.current.mutateAsync());

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.medicines.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.analytics.live });
  });

  // The dialog showed one list; the server may have written off another. The
  // toast reports the server's numbers.
  it('reports the server’s numbers in the success toast', async () => {
    vi.mocked(api.post).mockResolvedValue({
      withdrawn: 4,
      units: 310,
      items: [item('a', 100), item('b', 100), item('c', 100), item('d', 10)],
    });
    const { result } = renderHookWithClient(() => useWithdrawExpired());

    await act(() => result.current.mutateAsync());

    expect(toast.success).toHaveBeenCalledWith('Wrote off 310 units across 4 batches');
  });

  it('uses the singular for one unit in one batch', async () => {
    vi.mocked(api.post).mockResolvedValue({ withdrawn: 1, units: 1, items: [item('a', 1)] });
    const { result } = renderHookWithClient(() => useWithdrawExpired());

    await act(() => result.current.mutateAsync());

    expect(toast.success).toHaveBeenCalledWith('Wrote off 1 unit across 1 batch');
  });

  it('says so when someone else already cleared the shelf', async () => {
    vi.mocked(api.post).mockResolvedValue({ withdrawn: 0, units: 0, items: [] });
    const { result, client } = renderHookWithClient(() => useWithdrawExpired());
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(() => result.current.mutateAsync());

    expect(toast.info).toHaveBeenCalledWith(
      'Nothing to write off. Those batches were already withdrawn.'
    );
    expect(toast.success).not.toHaveBeenCalled();
    // Still refetch: the list on screen is the stale one.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.medicines.all });
  });

  it('reports a failure, changes nothing and does not refresh', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', 500));
    const { result, client } = renderHookWithClient(() => useWithdrawExpired());
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });

    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });
});

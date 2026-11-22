import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import { renderHookWithClient } from '@/test/render';

import { useAvailableBeds } from './use-beds';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), page: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset().mockResolvedValue([]);
});

describe('useAvailableBeds', () => {
  it('asks for free beds, narrowed by ward when given one', async () => {
    const { result } = renderHookWithClient(() => useAvailableBeds({ ward: 'Ward B' }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/beds/available', { params: { ward: 'Ward B' } });
  });

  it('does not poll by default, so the bed board keeps its own cadence', async () => {
    const { result, client } = renderHookWithClient(() => useAvailableBeds());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [query] = client.getQueryCache().getAll();
    expect(query!.observers[0]!.options.refetchInterval).toBeUndefined();
  });

  // The front desk keeps a free-bed count on screen all shift.
  it('can be asked to refresh on an interval', async () => {
    const { result, client } = renderHookWithClient(() =>
      useAvailableBeds(undefined, { refetchInterval: 60_000 })
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [query] = client.getQueryCache().getAll();
    expect(query!.observers[0]!.options.refetchInterval).toBe(60_000);
  });
});

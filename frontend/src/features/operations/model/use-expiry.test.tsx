import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/queryKeys';
import { renderHookWithClient } from '@/test/render';

import { useExpiryShelf } from './use-expiry';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), page: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

const NOW = new Date('2026-11-22T10:00:00.000Z');

function batch(id: string, expiryDate: string, quantity = 10) {
  return { id, name: `Medicine ${id}`, batchNumber: `B-${id}`, quantity, unit: 'tablet', expiryDate };
}

beforeEach(() => {
  // Only the clock: faking timers wholesale would stall TanStack's own scheduling.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.mocked(api.get).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useExpiryShelf', () => {
  it('makes one request for the look-ahead window', async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const { result } = renderHookWithClient(() => useExpiryShelf(90));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/medicines/expiring', { params: { days: 90 } });
  });

  // `/expiring` returns everything with expiryDate <= now + days, expired
  // batches included. The page splits them; a second `/expired` call is waste.
  it('splits expired batches from the ones still to expire, by the clock', async () => {
    vi.mocked(api.get).mockResolvedValue([
      batch('late', '2026-12-01T00:00:00.000Z'),
      batch('gone', '2026-11-02T00:00:00.000Z'),
      batch('soon', '2026-11-25T00:00:00.000Z'),
    ]);
    const { result } = renderHookWithClient(() => useExpiryShelf(30));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.expired.map((b) => b.id)).toEqual(['gone']);
    expect(result.current.soon.map((b) => b.id)).toEqual(['soon', 'late']);
  });

  // A batch dated today at midnight is already past by ten o'clock, and the
  // server's write-off (`expiryDate <= now`) would sweep it too.
  it('counts a batch that expires today, and one expiring this very instant, as expired', async () => {
    vi.mocked(api.get).mockResolvedValue([
      batch('midnight', '2026-11-22T00:00:00.000Z'),
      batch('instant', '2026-11-22T10:00:00.000Z'),
      batch('tonight', '2026-11-22T23:59:00.000Z'),
    ]);
    const { result } = renderHookWithClient(() => useExpiryShelf(7));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.expired.map((b) => b.id)).toEqual(['midnight', 'instant']);
    expect(result.current.soon.map((b) => b.id)).toEqual(['tonight']);
  });

  it('sorts both groups soonest first, whatever order the server used', async () => {
    vi.mocked(api.get).mockResolvedValue([
      batch('c', '2026-11-20T00:00:00.000Z'),
      batch('a', '2026-11-01T00:00:00.000Z'),
      batch('z', '2026-12-10T00:00:00.000Z'),
      batch('y', '2026-11-30T00:00:00.000Z'),
    ]);
    const { result } = renderHookWithClient(() => useExpiryShelf(30));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.expired.map((b) => b.id)).toEqual(['a', 'c']);
    expect(result.current.soon.map((b) => b.id)).toEqual(['y', 'z']);
  });

  it('reports empty groups, not undefined, while loading and when nothing is due', async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const { result } = renderHookWithClient(() => useExpiryShelf(30));

    expect(result.current.expired).toEqual([]);
    expect(result.current.soon).toEqual([]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.expired).toEqual([]);
  });

  // Changing "Look ahead" from 30 to 90 days must not show the 30-day list
  // under the 90-day heading while the new one loads.
  it('keeps each look-ahead window in its own cache entry', async () => {
    vi.mocked(api.get).mockResolvedValue([batch('a', '2026-11-30T00:00:00.000Z')]);
    const { result, client } = renderHookWithClient(() => useExpiryShelf(30));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.getQueryData(queryKeys.medicines.expiring(30))).toHaveLength(1);
    expect(client.getQueryData(queryKeys.medicines.expiring(90))).toBeUndefined();
  });
});

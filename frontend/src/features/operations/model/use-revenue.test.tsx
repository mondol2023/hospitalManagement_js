import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import { ApiError, type Page } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { renderHookWithClient } from '@/test/render';

import { useOutstanding, useRevenueTrend } from './use-revenue';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), page: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

const EMPTY_PAGE = { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
const RANGE = { from: '2026-10-23T00:00:00.000Z', to: '2026-11-22T23:59:59.999Z' };

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.page).mockReset().mockResolvedValue(EMPTY_PAGE);
});

describe('useRevenueTrend', () => {
  // `/bills/revenue` has no time series; the daily rollup lives in analytics.
  it('reads the daily collected series for the chosen range', async () => {
    vi.mocked(api.get).mockResolvedValue({ metric: 'revenue.collectedCents', points: [] });
    const { result } = renderHookWithClient(() => useRevenueTrend(RANGE));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/analytics/series/revenue.collectedCents', {
      params: { period: 'daily', ...RANGE },
    });
  });

  it('is cached under the analytics prefix with the range in the key', async () => {
    vi.mocked(api.get).mockResolvedValue({ points: [] });
    const { result, client } = renderHookWithClient(() => useRevenueTrend(RANGE));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      client.getQueryData(
        queryKeys.analytics.series('revenue.collectedCents', { period: 'daily', ...RANGE })
      )
    ).toBeDefined();
  });

  // Switching 30 days to 90 must not blank the chart: the old bars stay up, flagged
  // as placeholder, until the new series lands.
  it('keeps the previous range’s series on screen while the next one loads', async () => {
    const other = { from: '2026-08-24T00:00:00.000Z', to: RANGE.to };
    const first = { metric: 'revenue.collectedCents', points: [{ recordedAt: RANGE.from, value: 1 }] };
    let release: (value: unknown) => void = () => undefined;
    vi.mocked(api.get)
      .mockResolvedValueOnce(first)
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));

    const { result, rerender } = renderHookWithClient(
      ({ range }: { range: typeof RANGE }) => useRevenueTrend(range),
      { initialProps: { range: RANGE } }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ range: other });

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(true));
    expect(result.current.data).toEqual(first);
    release({ ...first, points: [] });
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
  });

  // A role mismatch comes back as a 403. The page hides only the trend, so the
  // hook must hand the error to the page with its status intact.
  it('exposes a refusal as an error carrying its status', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError('FORBIDDEN', 'Not for your role', 403));
    const { result } = renderHookWithClient(() => useRevenueTrend(RANGE));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as ApiError).status).toBe(403);
  });
});

describe('useOutstanding', () => {
  it('lists the oldest unpaid bills first, twenty to a page', async () => {
    const { result } = renderHookWithClient(() => useOutstanding(1));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.page).toHaveBeenCalledWith('/bills/outstanding', {
      params: { page: 1, limit: 20, sort: 'createdAt' },
    });
  });

  it('asks for the page it is given', async () => {
    const { result } = renderHookWithClient(() => useOutstanding(3));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.page).toHaveBeenCalledWith('/bills/outstanding', {
      params: { page: 3, limit: 20, sort: 'createdAt' },
    });
  });

  // Paging must not blank the table between page 1 and page 2.
  it('keeps the previous page on screen while the next one loads', async () => {
    const first = { ...EMPTY_PAGE, items: [{ id: 'b1' }] };
    let release: (value: Page<unknown>) => void = () => undefined;
    vi.mocked(api.page)
      .mockResolvedValueOnce(first)
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));

    const { result, rerender } = renderHookWithClient(
      ({ page }: { page: number }) => useOutstanding(page),
      { initialProps: { page: 1 } }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ page: 2 });

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(true));
    expect(result.current.data?.items).toEqual([{ id: 'b1' }]);
    release({ ...EMPTY_PAGE, items: [{ id: 'b2' }] });
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
  });
});

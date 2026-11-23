import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/queryKeys';
import { renderHookWithClient } from '@/test/render';

import { useMovements } from './use-movements';
import { useStockReport } from './use-stock-report';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), page: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.page).mockReset();
});

describe('useStockReport', () => {
  it('fetches the report for the chosen window', async () => {
    vi.mocked(api.get).mockResolvedValue({ lowStock: [] });
    const { result } = renderHookWithClient(() => useStockReport(7));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith('/medicines/stock-report', { params: { days: 7 } });
  });

  // Every pharmacy write invalidates `medicines.all`; the report only refreshes
  // after a restock if its key sits under that prefix.
  it('caches under the medicines namespace, one entry per window', async () => {
    vi.mocked(api.get).mockResolvedValue({ lowStock: [] });
    const { result, client } = renderHookWithClient(() => useStockReport(90));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.getQueryData(queryKeys.medicines.stockReport(90))).toBeDefined();
    expect(queryKeys.medicines.stockReport(90).slice(0, 1)).toEqual(queryKeys.medicines.all);
    expect(queryKeys.medicines.stockReport(7)).not.toEqual(queryKeys.medicines.stockReport(30));
  });

  it('refetches when the window is changed', async () => {
    vi.mocked(api.get).mockResolvedValue({ lowStock: [] });
    const { result, rerender } = renderHookWithClient(({ days }) => useStockReport(days), {
      initialProps: { days: 30 },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ days: 90 });

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/medicines/stock-report', { params: { days: 90 } })
    );
  });
});

describe('useMovements', () => {
  const page = { items: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 1 } };

  it('fetches the filtered page', async () => {
    vi.mocked(api.page).mockResolvedValue(page);
    const params = { page: 1, limit: 25, sort: '-createdAt', kind: 'dispense' as const };
    const { result } = renderHookWithClient(() => useMovements(params));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.page).toHaveBeenCalledWith('/medicines/stock-movements', { params });
  });

  it('sends nothing while there are no params to send', async () => {
    const { result } = renderHookWithClient(() => useMovements(null));

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(api.page).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('caches under the medicines namespace, keyed by the filters', async () => {
    vi.mocked(api.page).mockResolvedValue(page);
    const params = { page: 3, actor: 'u1' };
    const { result, client } = renderHookWithClient(() => useMovements(params));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.getQueryData(queryKeys.medicines.movements(params))).toBeDefined();
    expect(queryKeys.medicines.movements(params).slice(0, 1)).toEqual(queryKeys.medicines.all);
  });

  // The table keeps showing the last page while the next filter loads, rather
  // than flashing a skeleton on every chip click.
  it('keeps the previous rows on screen while a new filter loads', async () => {
    const first = {
      items: [{ id: 'a' }],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    };
    vi.mocked(api.page).mockResolvedValueOnce(first as never);
    const { result, rerender } = renderHookWithClient(({ kind }) => useMovements({ kind }), {
      initialProps: { kind: 'restock' as 'restock' | 'adjust' },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    vi.mocked(api.page).mockReturnValueOnce(new Promise(() => undefined));
    rerender({ kind: 'adjust' });

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(true));
    expect(result.current.data).toEqual(first);
  });
});

import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import { renderHookWithClient } from '@/test/render';

import { useRevenue } from './use-billing';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), page: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

const summary = (billedCents: number) => ({
  from: '2026-10-23T00:00:00.000Z',
  to: '2026-11-22T23:59:59.999Z',
  billedCents,
  collectedCents: 0,
  outstandingCents: billedCents,
  count: 1,
  byStatus: {},
});

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});

describe('useRevenue', () => {
  it('sends the chosen range to the server', async () => {
    vi.mocked(api.get).mockResolvedValue(summary(100));
    const range = { from: '2026-10-23T00:00:00.000Z', to: '2026-11-22T23:59:59.999Z' };
    const { result } = renderHookWithClient(() => useRevenue(range));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/bills/revenue', { params: range });
  });

  // Changing the range must not blank the figures: the old ones stay, dimmed,
  // until the new ones land. An accountant never reads a flash of nothing.
  it('keeps the previous range’s figures while the next range loads', async () => {
    let release: (value: unknown) => void = () => undefined;
    vi.mocked(api.get)
      .mockResolvedValueOnce(summary(6190000))
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));

    const { result, rerender } = renderHookWithClient(
      ({ days }: { days: number }) =>
        useRevenue({ from: `2026-01-0${days}T00:00:00.000Z`, to: '2026-11-22T23:59:59.999Z' }),
      { initialProps: { days: 1 } }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ days: 2 });

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(true));
    expect(result.current.data?.billedCents).toBe(6190000);
    release(summary(1000));
    await waitFor(() => expect(result.current.data?.billedCents).toBe(1000));
    expect(result.current.isPlaceholderData).toBe(false);
  });
});

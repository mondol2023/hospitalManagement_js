import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';

import { medicinesApi, type WithdrawResult } from './medicines-api';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), page: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
});

describe('medicinesApi.withdrawExpired', () => {
  // The literal is annotated with the response type, so tsc fails if the type
  // drifts from what the backend sends (`{ withdrawn, units, items }`).
  it('returns the write-off summary: batches, units and what was written off', async () => {
    const summary: WithdrawResult = {
      withdrawn: 1,
      units: 120,
      items: [
        {
          id: 'm1',
          name: 'Amoxicillin 250 mg',
          batchNumber: 'B-7781',
          quantity: 120,
          unit: 'capsule',
          expiryDate: '2026-11-02T00:00:00.000Z',
        },
      ],
    };
    vi.mocked(api.post).mockResolvedValue(summary);

    const result = await medicinesApi.withdrawExpired();

    expect(api.post).toHaveBeenCalledWith('/medicines/withdraw-expired', {});
    expect(result.units).toBe(120);
    expect(result.items[0]?.unit).toBe('capsule');
  });
});

describe('medicinesApi.expiring', () => {
  it('sends the look-ahead window', async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    await medicinesApi.expiring(90);

    expect(api.get).toHaveBeenCalledWith('/medicines/expiring', { params: { days: 90 } });
  });
});

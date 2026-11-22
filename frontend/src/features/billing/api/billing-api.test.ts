import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';

import { billingApi } from './billing-api';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), page: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(api.page).mockReset().mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  });
});

describe('billingApi.outstanding', () => {
  it('can ask for the oldest bills first', async () => {
    await billingApi.outstanding({ page: 2, limit: 20, sort: 'createdAt' });

    expect(api.page).toHaveBeenCalledWith('/bills/outstanding', {
      params: { page: 2, limit: 20, sort: 'createdAt' },
    });
  });
});

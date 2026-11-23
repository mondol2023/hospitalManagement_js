import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';

import { usersApi } from './users-api';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), page: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(api.page).mockReset();
});

describe('usersApi.list', () => {
  it('reads the paged user list, sending the search, role and active filters as given', async () => {
    vi.mocked(api.page).mockResolvedValue({ items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });

    await usersApi.list({ search: 'asha', role: 'pharmacist', isActive: true, limit: 20 });

    expect(api.page).toHaveBeenCalledWith('/users', {
      params: { search: 'asha', role: 'pharmacist', isActive: true, limit: 20 },
    });
  });
});

describe('usersApi.get', () => {
  it('reads one account by id', async () => {
    vi.mocked(api.get).mockResolvedValue({ id: 'u1', name: 'Asha Rao' });

    const person = await usersApi.get('u1');

    expect(api.get).toHaveBeenCalledWith('/users/u1');
    expect(person).toEqual({ id: 'u1', name: 'Asha Rao' });
  });
});

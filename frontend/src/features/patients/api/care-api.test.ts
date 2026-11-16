import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';

import { careLogsApi } from './care-api';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), page: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(api.post).mockReset().mockResolvedValue({});
  vi.mocked(api.page).mockReset().mockResolvedValue({ items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
});

describe('careLogsApi.logHandover', () => {
  // The first version sent `{ patientId, notes }`; the backend's validator wants
  // `toNurseUserId` and `summary`, so every handover failed with a 400.
  it('sends the fields the backend validates', async () => {
    await careLogsApi.logHandover({
      patientId: 'p1',
      toNurseUserId: 'n2',
      summary: 'Stable overnight.',
      outstandingTasks: ['Repeat obs at 21:00'],
    });

    expect(api.post).toHaveBeenCalledWith('/care-logs/handovers', {
      patientId: 'p1',
      toNurseUserId: 'n2',
      summary: 'Stable overnight.',
      outstandingTasks: ['Repeat obs at 21:00'],
    });
  });
});

describe('careLogsApi.byWard', () => {
  it('passes paging and the type filter through', async () => {
    await careLogsApi.byWard('ICU', { page: 2, limit: 20, type: 'vitals' });

    expect(api.page).toHaveBeenCalledWith('/care-logs/ward/ICU', {
      params: { page: 2, limit: 20, type: 'vitals' },
    });
  });

  it('encodes a ward name that needs it', async () => {
    await careLogsApi.byWard('Ward A/B');

    expect(vi.mocked(api.page).mock.calls[0]![0]).toBe('/care-logs/ward/Ward%20A%2FB');
  });
});

describe('careLogsApi.mine', () => {
  it('asks for the signed-in nurse’s own entries, narrowed by type and time', async () => {
    await careLogsApi.mine({ type: 'handover', from: '2026-11-16T07:00:00.000Z', limit: 10 });

    expect(api.page).toHaveBeenCalledWith('/care-logs/me', {
      params: { type: 'handover', from: '2026-11-16T07:00:00.000Z', limit: 10 },
    });
  });
});

describe('careLogsApi.acknowledge', () => {
  it('sends no body when there is no note', async () => {
    await careLogsApi.acknowledge('log1');

    expect(api.post).toHaveBeenCalledWith('/care-logs/log1/acknowledge');
  });
});

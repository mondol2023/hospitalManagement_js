import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';

import { appointmentsApi } from './appointments-api';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), page: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset().mockResolvedValue([]);
});

describe('appointmentsApi.daySchedule', () => {
  it('asks for the day only, by default', async () => {
    await appointmentsApi.daySchedule('d1', '2026-11-21');

    expect(api.get).toHaveBeenCalledWith('/appointments/doctor/d1/day', {
      params: { date: '2026-11-21' },
    });
  });

  it('adds includeClosed when finished visits are wanted', async () => {
    await appointmentsApi.daySchedule('d1', '2026-11-21', { includeClosed: true });

    expect(api.get).toHaveBeenCalledWith('/appointments/doctor/d1/day', {
      params: { date: '2026-11-21', includeClosed: true },
    });
  });

  // `includeClosed=false` is parsed correctly server-side, but there is no reason
  // to put a default on the wire or to split the cache between two spellings of it.
  it('leaves includeClosed off the wire when it is false', async () => {
    await appointmentsApi.daySchedule('d1', '2026-11-21', { includeClosed: false });

    expect(api.get).toHaveBeenCalledWith('/appointments/doctor/d1/day', {
      params: { date: '2026-11-21' },
    });
  });
});

describe('appointmentsApi.arrivals', () => {
  it('reads the staff list with the day, filters and paging', async () => {
    vi.mocked(api.page).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    await appointmentsApi.arrivals({
      from: '2026-11-21T18:00:00.000Z',
      to: '2026-11-22T17:59:59.999Z',
      status: 'pending',
      doctor: 'd1',
      limit: 20,
      sort: 'scheduledAt',
    });

    expect(api.page).toHaveBeenCalledWith('/appointments', {
      params: {
        from: '2026-11-21T18:00:00.000Z',
        to: '2026-11-22T17:59:59.999Z',
        status: 'pending',
        doctor: 'd1',
        limit: 20,
        sort: 'scheduledAt',
      },
    });
  });
});

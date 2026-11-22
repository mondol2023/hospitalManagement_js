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

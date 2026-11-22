import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';

import { patientsApi } from './patients-api';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), page: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset().mockResolvedValue({ id: 'p1' });
});

describe('patientsApi.byMrn', () => {
  it('escapes the MRN into the path', async () => {
    await patientsApi.byMrn('MRN 0042/13');

    expect(api.get).toHaveBeenCalledWith('/patients/mrn/MRN%200042%2F13');
  });
});

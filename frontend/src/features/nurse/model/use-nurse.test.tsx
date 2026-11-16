import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { directoryApi } from '@/features/directory';
import { api } from '@/shared/api/client';
import { renderHookWithClient } from '@/test/render';

import { nurseApi } from '../api/nurse-api';
import { useWorkload } from './use-nurse';

vi.mock('@/shared/api/client', () => ({ api: { get: vi.fn() } }));

beforeEach(() => vi.mocked(api.get).mockReset());

describe('nurseApi.workload', () => {
  it('reads the signed-in nurse’s workload', async () => {
    vi.mocked(api.get).mockResolvedValue({ assigned: 6, capacity: 8, atCapacity: false });

    await expect(nurseApi.workload()).resolves.toEqual({ assigned: 6, capacity: 8, atCapacity: false });
    expect(api.get).toHaveBeenCalledWith('/nurses/me/workload');
  });
});

describe('useWorkload', () => {
  it('exposes assigned, capacity and atCapacity', async () => {
    vi.mocked(api.get).mockResolvedValue({ assigned: 8, capacity: 8, atCapacity: true });
    const { result } = renderHookWithClient(() => useWorkload());

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual({ assigned: 8, capacity: 8, atCapacity: true });
  });
});

describe('directoryApi.nursesOnDuty', () => {
  it('encodes the ward in the path', async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    await directoryApi.nursesOnDuty('Ward A/B');

    expect(api.get).toHaveBeenCalledWith('/nurses/ward/Ward%20A%2FB/on-duty');
  });
});

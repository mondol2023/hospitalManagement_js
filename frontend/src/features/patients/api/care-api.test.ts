import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';

import { careLogsApi, medicalRecordsApi } from './care-api';

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

describe('medicalRecordsApi.followUps', () => {
  // The first wrapper sent `from`/`to`, which the validator silently drops, so
  // every call came back with the default window.
  it('sends the window the backend validates, and nothing it would drop', async () => {
    await medicalRecordsApi.followUps({ overdue: true, doctorId: 'd1', page: 2, limit: 10 });

    expect(api.page).toHaveBeenCalledWith('/medical-records/follow-ups', {
      params: { overdue: true, doctorId: 'd1', page: 2, limit: 10 },
    });
  });

  it('passes the upcoming window as days', async () => {
    await medicalRecordsApi.followUps({ days: 30 });

    expect(api.page).toHaveBeenCalledWith('/medical-records/follow-ups', { params: { days: 30 } });
  });
});

describe('medicalRecordsApi.remind', () => {
  it('posts the window as a query parameter, since the route reads req.query', async () => {
    vi.mocked(api.post).mockResolvedValue({ due: 3, sent: 2 });

    const result = await medicalRecordsApi.remind({ days: 1 });

    expect(api.post).toHaveBeenCalledWith('/medical-records/follow-ups/remind', undefined, {
      params: { days: 1 },
    });
    expect(result).toEqual({ due: 3, sent: 2 });
  });
});

describe('medicalRecordsApi.addAttachments', () => {
  it('sends every file under the field `files` and lets the browser write the boundary', async () => {
    const scan = new File(['a'], 'scan.png', { type: 'image/png' });
    const report = new File(['b'], 'report.pdf', { type: 'application/pdf' });

    await medicalRecordsApi.addAttachments('r1', [scan, report]);

    const [url, body, config] = vi.mocked(api.post).mock.calls[0]!;
    expect(url).toBe('/medical-records/r1/attachments');
    expect((body as FormData).getAll('files')).toEqual([scan, report]);
    expect(config).toEqual({ headers: { 'Content-Type': undefined } });
  });
});

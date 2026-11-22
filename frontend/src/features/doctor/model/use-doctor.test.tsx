import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { toast } from '@/shared/ui';
import { renderHookWithClient } from '@/test/render';

import {
  useAddAttachments,
  useFollowUps,
  useMedicalRecord,
  useMyAuthoredRecords,
  useRecordConsultation,
  useSendFollowUpReminders,
} from './use-doctor';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), page: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

const EMPTY_PAGE = { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };

beforeEach(() => {
  vi.mocked(api.post).mockReset();
  vi.mocked(api.get).mockReset();
  vi.mocked(api.page).mockReset().mockResolvedValue(EMPTY_PAGE);
  vi.spyOn(toast, 'success').mockImplementation(() => '');
  vi.spyOn(toast, 'info').mockImplementation(() => '');
  vi.spyOn(toast, 'error').mockImplementation(() => '');
});

const scan = new File(['a'], 'scan.png', { type: 'image/png' });

describe('useMyAuthoredRecords', () => {
  it('lists what the signed-in doctor wrote', async () => {
    const { result } = renderHookWithClient(() => useMyAuthoredRecords({ limit: 5 }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.page).toHaveBeenCalledWith('/medical-records/me', { params: { limit: 5 } });
  });
});

describe('useMedicalRecord', () => {
  it('loads one full record for the drawer', async () => {
    vi.mocked(api.get).mockResolvedValue({ id: 'r1', diagnosis: 'Asthma' });
    const { result } = renderHookWithClient(() => useMedicalRecord('r1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/medical-records/r1');
  });

  // The drawer is mounted closed, with no id; it must not ask for `/medical-records/undefined`.
  it('does not fetch until there is an id', () => {
    renderHookWithClient(() => useMedicalRecord(null));
    expect(api.get).not.toHaveBeenCalled();
  });

  it('is refreshed by an upload, which invalidates the medical-records prefix', () => {
    expect(queryKeys.medicalRecords.detail('r1').slice(0, 1)).toEqual(
      queryKeys.medicalRecords.all
    );
  });
});

describe('useFollowUps', () => {
  it('asks for the overdue list when told to', async () => {
    const { result } = renderHookWithClient(() => useFollowUps({ overdue: true }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.page).toHaveBeenCalledWith('/medical-records/follow-ups', {
      params: { overdue: true },
    });
  });

  // Tabs share one hook; if their keys collided, switching from "Overdue" to
  // "Next 7 days" would briefly show the other tab's rows.
  it('keeps each tab and each doctor filter in its own cache entry', () => {
    expect(queryKeys.medicalRecords.followUps({ overdue: true })).not.toEqual(
      queryKeys.medicalRecords.followUps({ days: 7 })
    );
    expect(queryKeys.medicalRecords.followUps({ days: 7, doctorId: 'd1' })).not.toEqual(
      queryKeys.medicalRecords.followUps({ days: 7, doctorId: 'd2' })
    );
  });

  it('sits under the medical-records prefix, so recording a visit refreshes it', () => {
    expect(queryKeys.medicalRecords.followUps({ days: 7 }).slice(0, 1)).toEqual(
      queryKeys.medicalRecords.all
    );
  });
});

describe('useSendFollowUpReminders', () => {
  it('sends tomorrow’s reminders and says how many patients were reached', async () => {
    vi.mocked(api.post).mockResolvedValue({ due: 5, sent: 4 });
    const { result } = renderHookWithClient(() => useSendFollowUpReminders());

    await act(() => result.current.mutateAsync());

    expect(api.post).toHaveBeenCalledWith('/medical-records/follow-ups/remind', undefined, {
      params: { days: 1 },
    });
    expect(toast.success).toHaveBeenCalledWith('4 of 5 patients notified');
  });

  it('reports a failed send', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', 500));
    const { result } = renderHookWithClient(() => useSendFollowUpReminders());

    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });

    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('useAddAttachments', () => {
  it('uploads against the record, refreshes it and says how many files went up', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const { result, client } = renderHookWithClient(() => useAddAttachments('r1'));
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(() => result.current.mutateAsync([scan, scan]));

    expect(vi.mocked(api.post).mock.calls[0]![0]).toBe('/medical-records/r1/attachments');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.medicalRecords.all });
    expect(toast.success).toHaveBeenCalledWith('2 files attached');
  });

  it('uses the singular for one file', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const { result } = renderHookWithClient(() => useAddAttachments('r1'));

    await act(() => result.current.mutateAsync([scan]));

    expect(toast.success).toHaveBeenCalledWith('1 file attached');
  });

  it('says so when the record is full, rather than showing the raw conflict', async () => {
    vi.mocked(api.post).mockRejectedValue(
      new ApiError('TOO_MANY_ATTACHMENTS', 'A record holds at most 20 attachments', 409)
    );
    const { result } = renderHookWithClient(() => useAddAttachments('r1'));

    await act(async () => {
      await result.current.mutateAsync([scan]).catch(() => undefined);
    });

    expect(toast.error).toHaveBeenCalledWith(
      'This record already holds the maximum of 20 attachments'
    );
  });

  it('tells the doctor to wait when the upload limiter steps in', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError('RATE_LIMITED', 'Slow down', 429));
    const { result } = renderHookWithClient(() => useAddAttachments('r1'));

    await act(async () => {
      await result.current.mutateAsync([scan]).catch(() => undefined);
    });

    expect(toast.error).toHaveBeenCalledWith(
      'Too many uploads just now. Wait a minute and try again.'
    );
  });

  it('falls back to the server’s wording for anything else', async () => {
    vi.mocked(api.post).mockRejectedValue(
      new ApiError('BAD_REQUEST', 'Unsupported file type. Allowed: image/jpeg', 400)
    );
    const { result } = renderHookWithClient(() => useAddAttachments('r1'));

    await act(async () => {
      await result.current.mutateAsync([scan]).catch(() => undefined);
    });

    expect(toast.error).toHaveBeenCalledWith('Unsupported file type. Allowed: image/jpeg');
  });
});

describe('useRecordConsultation', () => {
  const input = { patientId: 'p1', diagnosis: 'Hypertension', appointmentId: 'a1' };

  it('saves the record and refreshes records, follow-ups and the day’s appointments', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'r1' });
    const { result, client } = renderHookWithClient(() => useRecordConsultation());
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(() => result.current.mutateAsync(input));

    expect(api.post).toHaveBeenCalledWith('/medical-records', input);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.medicalRecords.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.appointments.all });
  });

  // Files can only be attached to a saved record, so the success toast is where
  // the doctor is offered the next step.
  it('offers “Add attachments” on the success toast when it is told where that goes', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'r9' });
    const onOpenRecord = vi.fn();
    const { result } = renderHookWithClient(() => useRecordConsultation({ onOpenRecord }));

    await act(() => result.current.mutateAsync(input));

    expect(toast.success).toHaveBeenCalledTimes(1);
    const action = vi.mocked(toast.success).mock.calls[0]?.[2];
    expect(action?.label).toBe('Add attachments');
    action?.onClick();
    expect(onOpenRecord).toHaveBeenCalledWith('r9');
  });

  it('offers no action on the success toast when nothing can open the record', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'r9' });
    const { result } = renderHookWithClient(() => useRecordConsultation());

    await act(() => result.current.mutateAsync(input));

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.success).mock.calls[0]?.[2]).toBeUndefined();
  });

  // The form shows this one inline and stays open; a persistent error toast on
  // top of it would say the same thing twice.
  it('leaves the “already recorded” conflict to the form', async () => {
    vi.mocked(api.post).mockRejectedValue(
      new ApiError('APPOINTMENT_ALREADY_RECORDED', 'This appointment already has a record', 409)
    );
    const { result } = renderHookWithClient(() => useRecordConsultation());

    await act(async () => {
      await result.current.mutateAsync(input).catch(() => undefined);
    });

    await waitFor(() => expect(result.current.alreadyRecorded).toBe(true));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('still reports any other failure, and is not “already recorded”', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', 500));
    const { result } = renderHookWithClient(() => useRecordConsultation());

    await act(async () => {
      await result.current.mutateAsync(input).catch(() => undefined);
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(result.current.alreadyRecorded).toBe(false);
  });
});

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  APPOINTMENT_ALREADY_RECORDED,
  medicalRecordsApi,
  useCreateMedicalRecord,
  type FollowUpParams,
} from '@/features/patients';
import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { toast } from '@/shared/ui';

/**
 * One full record, for the detail drawer. Disabled while no record is selected,
 * so a drawer that is mounted closed never asks for `/medical-records/null`.
 */
export function useMedicalRecord(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.medicalRecords.detail(id ?? ''),
    queryFn: () => medicalRecordsApi.getById(id as string),
    enabled: Boolean(id),
  });
}

/** Records the signed-in doctor wrote, newest first. */
export function useMyAuthoredRecords(
  params?: { page?: number; limit?: number },
  { enabled = true }: { enabled?: boolean } = {}
) {
  return useQuery({
    enabled,
    queryKey: queryKeys.medicalRecords.authored(params),
    queryFn: () => medicalRecordsApi.mine(params),
    placeholderData: (previous) => previous,
  });
}

/**
 * The follow-up listing. The params are the tab (`overdue`, or `days`) and, for
 * admin roles, the doctor filter — and they are the cache key, so each tab keeps
 * its own rows.
 */
export function useFollowUps(
  params?: FollowUpParams,
  { enabled = true }: { enabled?: boolean } = {}
) {
  return useQuery({
    enabled,
    queryKey: queryKeys.medicalRecords.followUps(params),
    queryFn: () => medicalRecordsApi.followUps(params),
    placeholderData: (previous) => previous,
  });
}

/**
 * Sends tomorrow's reminders — the same `days: 1` window the scheduled job
 * uses — whatever tab is on screen. The window is fixed here, not a parameter,
 * so the confirm dialog's wording cannot drift from what actually goes out.
 */
export function useSendFollowUpReminders() {
  return useMutation({
    mutationFn: () => medicalRecordsApi.remind({ days: 1 }),
    onSuccess: ({ due, sent }) => {
      toast.success(`${sent} of ${due} patients notified`);
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.userMessage : 'Could not send the reminders'
      );
    },
  });
}

function attachmentFailure(error: unknown): string {
  if (error instanceof ApiError) {
    // The code, not the status: `TOO_MANY_ATTACHMENTS` is the only 409 here.
    if (error.code === 'TOO_MANY_ATTACHMENTS') {
      return 'This record already holds the maximum of 20 attachments';
    }
    if (error.status === 429) {
      return 'Too many uploads just now. Wait a minute and try again.';
    }
    return error.userMessage;
  }
  return 'Could not attach those files';
}

/** Adds files to a saved record. The authoring doctor only — the backend enforces it. */
export function useAddAttachments(recordId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (files: File[]) => medicalRecordsApi.addAttachments(recordId, files),
    onSuccess: (_record, files) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.medicalRecords.all });
      toast.success(`${files.length} ${files.length === 1 ? 'file' : 'files'} attached`);
    },
    onError: (error) => {
      toast.error(attachmentFailure(error));
    },
  });
}

/**
 * Saves a consultation. Adds `alreadyRecorded` to the mutation so the form can
 * show "This visit already has a record" inline and stay open, instead of
 * reading an error code itself.
 */
export function useRecordConsultation(options: { onOpenRecord?: (recordId: string) => void } = {}) {
  const mutation = useCreateMedicalRecord(options);
  const { error } = mutation;

  return {
    ...mutation,
    alreadyRecorded: error instanceof ApiError && error.code === APPOINTMENT_ALREADY_RECORDED,
  };
}

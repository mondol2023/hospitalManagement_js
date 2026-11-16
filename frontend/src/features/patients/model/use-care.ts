import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { toast } from '@/shared/ui';

import {
  careLogsApi,
  medicalRecordsApi,
  type CareLogParams,
  type HandoverInput,
  type MedicalRecordInput,
  type Vitals,
} from '../api/care-api';

function reportFailure(fallback: string) {
  return (error: unknown) => {
    toast.error(error instanceof ApiError ? error.userMessage : fallback);
  };
}

// ── Care logs ───────────────────────────────────────────────────────────────

export function useCareLogs(patientId: string | undefined, params?: CareLogParams) {
  return useQuery({
    queryKey: queryKeys.careLogs.byPatient(patientId ?? '', params),
    queryFn: () => careLogsApi.byPatient(patientId as string, params),
    enabled: Boolean(patientId),
    placeholderData: (previous) => previous,
  });
}

export function useLatestVitals(patientId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.careLogs.latestVitals(patientId ?? ''),
    queryFn: () => careLogsApi.latestVitals(patientId as string),
    enabled: Boolean(patientId),
  });
}

/** The nurse-facing "needs a look" queue. */
export function useAttentionLogs(
  params?: { page?: number; limit?: number; ward?: string },
  { enabled = true }: { enabled?: boolean } = {}
) {
  return useQuery({
    enabled,
    queryKey: queryKeys.careLogs.attention(params),
    queryFn: () => careLogsApi.attention(params),
    // Shorter than the global 30s: this list is the reason someone walks to a
    // bay, and stale entries send them to the wrong one.
    refetchInterval: 60_000,
  });
}

/** The nurses' station feed for one ward. Disabled until a ward is chosen. */
export function useWardFeed(ward: string | undefined, params?: CareLogParams) {
  return useQuery({
    queryKey: queryKeys.careLogs.ward(ward ?? '', params),
    queryFn: () => careLogsApi.byWard(ward as string, params),
    enabled: Boolean(ward),
    placeholderData: (previous) => previous,
  });
}

/** What the signed-in clinician has recorded themselves. */
export function useMyCareLogs(
  params?: CareLogParams,
  { enabled = true }: { enabled?: boolean } = {}
) {
  return useQuery({
    enabled,
    queryKey: queryKeys.careLogs.mine(params),
    queryFn: () => careLogsApi.mine(params),
    placeholderData: (previous) => previous,
  });
}

export function useLogVitals(patientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { vitals: Vitals; notes?: string }) =>
      careLogsApi.logVitals({ patientId, ...input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all });
      toast.success('Vitals recorded');
    },
    onError: reportFailure('Could not record those vitals'),
  });
}

export function useLogObservation(patientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { notes: string; requiresAttention?: boolean }) =>
      careLogsApi.logObservation({ patientId, ...input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all });
      toast.success('Observation logged');
    },
    onError: reportFailure('Could not log that observation'),
  });
}

export function useAcknowledgeCareLog() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all });

  return useMutation({
    mutationFn: (logId: string) => careLogsApi.acknowledge(logId),
    onSuccess: () => {
      void refresh();
      toast.success('Entry acknowledged');
    },
    onError: (error) => {
      // Acknowledgement is first-responder-wins. Losing the race is an expected
      // outcome, not a failure: say so, and refetch so the entry leaves the list.
      if (error instanceof ApiError && error.status === 409) {
        void refresh();
        toast.info('Already picked up by a colleague');
        return;
      }
      reportFailure('Could not acknowledge that entry')(error);
    },
  });
}

/**
 * Hands a patient over to the next nurse. The receiver's name rides along only
 * so the toast can say who was told; it is not sent to the server.
 */
export function useLogHandover() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ input }: { input: HandoverInput; receiverName: string }) =>
      careLogsApi.logHandover(input),
    onSuccess: (_log, { receiverName }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all });
      toast.success(`Handover sent to ${receiverName}`);
    },
    onError: reportFailure('Could not send that handover'),
  });
}

// ── Medical records ─────────────────────────────────────────────────────────

export function useMedicalRecords(
  patientId: string | undefined,
  params?: { page?: number; limit?: number }
) {
  return useQuery({
    queryKey: queryKeys.medicalRecords.byPatient(patientId ?? '', params),
    queryFn: () => medicalRecordsApi.byPatient(patientId as string, params),
    enabled: Boolean(patientId),
    placeholderData: (previous) => previous,
  });
}

export function useOwnMedicalRecords(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.medicalRecords.byPatient('me', params),
    queryFn: () => medicalRecordsApi.mine(params),
    placeholderData: (previous) => previous,
  });
}

export function useFollowUps(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.medicalRecords.followUps(params),
    queryFn: () => medicalRecordsApi.followUps(params),
  });
}

export function useCreateMedicalRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MedicalRecordInput) => medicalRecordsApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.medicalRecords.all });
      toast.success('Consultation recorded');
    },
    onError: reportFailure('Could not save that consultation'),
  });
}

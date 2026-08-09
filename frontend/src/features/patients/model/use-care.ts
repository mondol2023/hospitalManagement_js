import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { toast } from '@/shared/ui';

import {
  careLogsApi,
  medicalRecordsApi,
  type CareLogParams,
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
export function useAttentionLogs(params?: { page?: number; limit?: number; ward?: string }) {
  return useQuery({
    queryKey: queryKeys.careLogs.attention(params),
    queryFn: () => careLogsApi.attention(params),
    // Shorter than the global 30s: this list is the reason someone walks to a
    // bay, and stale entries send them to the wrong one.
    refetchInterval: 60_000,
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

  return useMutation({
    mutationFn: (logId: string) => careLogsApi.acknowledge(logId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all });
    },
    onError: reportFailure('Could not acknowledge that entry'),
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

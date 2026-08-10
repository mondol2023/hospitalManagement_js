import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { toast } from '@/shared/ui';
import { careLogsApi, medicalRecordsApi, } from '../api/care-api';
function reportFailure(fallback) {
    return (error) => {
        toast.error(error instanceof ApiError ? error.userMessage : fallback);
    };
}
// ── Care logs ───────────────────────────────────────────────────────────────
export function useCareLogs(patientId, params) {
    return useQuery({
        queryKey: queryKeys.careLogs.byPatient(patientId ?? '', params),
        queryFn: () => careLogsApi.byPatient(patientId, params),
        enabled: Boolean(patientId),
        placeholderData: (previous) => previous,
    });
}
export function useLatestVitals(patientId) {
    return useQuery({
        queryKey: queryKeys.careLogs.latestVitals(patientId ?? ''),
        queryFn: () => careLogsApi.latestVitals(patientId),
        enabled: Boolean(patientId),
    });
}
/** The nurse-facing "needs a look" queue. */
export function useAttentionLogs(params) {
    return useQuery({
        queryKey: queryKeys.careLogs.attention(params),
        queryFn: () => careLogsApi.attention(params),
        // Shorter than the global 30s: this list is the reason someone walks to a
        // bay, and stale entries send them to the wrong one.
        refetchInterval: 60_000,
    });
}
export function useLogVitals(patientId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input) => careLogsApi.logVitals({ patientId, ...input }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all });
            toast.success('Vitals recorded');
        },
        onError: reportFailure('Could not record those vitals'),
    });
}
export function useLogObservation(patientId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input) => careLogsApi.logObservation({ patientId, ...input }),
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
        mutationFn: (logId) => careLogsApi.acknowledge(logId),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all });
        },
        onError: reportFailure('Could not acknowledge that entry'),
    });
}
// ── Medical records ─────────────────────────────────────────────────────────
export function useMedicalRecords(patientId, params) {
    return useQuery({
        queryKey: queryKeys.medicalRecords.byPatient(patientId ?? '', params),
        queryFn: () => medicalRecordsApi.byPatient(patientId, params),
        enabled: Boolean(patientId),
        placeholderData: (previous) => previous,
    });
}
export function useOwnMedicalRecords(params) {
    return useQuery({
        queryKey: queryKeys.medicalRecords.byPatient('me', params),
        queryFn: () => medicalRecordsApi.mine(params),
        placeholderData: (previous) => previous,
    });
}
export function useFollowUps(params) {
    return useQuery({
        queryKey: queryKeys.medicalRecords.followUps(params),
        queryFn: () => medicalRecordsApi.followUps(params),
    });
}
export function useCreateMedicalRecord() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input) => medicalRecordsApi.create(input),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.medicalRecords.all });
            toast.success('Consultation recorded');
        },
        onError: reportFailure('Could not save that consultation'),
    });
}

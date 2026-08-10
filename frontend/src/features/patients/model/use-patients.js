import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { toast } from '@/shared/ui';
import { patientsApi, } from '../api/patients-api';
/**
 * Server state for patients.
 *
 * Every mutation invalidates `queryKeys.patients.all` rather than surgically
 * patching the cache. A patient record is read from six screens at once (list,
 * detail, bed board, care team, chat header, billing), and a hand-written
 * `setQueryData` that forgets one of them shows a discharged patient as still
 * admitted — the exact class of bug that is invisible in review and obvious at
 * 3am on a ward.
 */
export function usePatients(params) {
    return useQuery({
        queryKey: queryKeys.patients.list(params),
        queryFn: () => patientsApi.list(params),
        // Keeps the previous page on screen while the next one loads, so paging
        // doesn't flash a skeleton over a table the user is reading.
        placeholderData: (previous) => previous,
    });
}
export function usePatient(patientId) {
    return useQuery({
        queryKey: queryKeys.patients.detail(patientId ?? ''),
        queryFn: () => patientsApi.getById(patientId),
        enabled: Boolean(patientId),
    });
}
/** The signed-in patient's own chart. */
export function useOwnPatientRecord(enabled = true) {
    return useQuery({
        queryKey: queryKeys.patients.me,
        queryFn: () => patientsApi.me(),
        enabled,
    });
}
export function useCaseload(params) {
    return useQuery({
        queryKey: queryKeys.patients.caseload(params),
        queryFn: () => patientsApi.caseload(params),
    });
}
export function useCareTeam(patientId) {
    return useQuery({
        queryKey: queryKeys.patients.careTeam(patientId ?? ''),
        queryFn: () => patientsApi.careTeam(patientId),
        enabled: Boolean(patientId),
    });
}
function reportFailure(fallback) {
    return (error) => {
        toast.error(error instanceof ApiError ? error.userMessage : fallback);
    };
}
export function useUpdateClinical(patientId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input) => patientsApi.updateClinical(patientId, input),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
            toast.success('Clinical details updated');
        },
        onError: reportFailure('Could not update clinical details'),
    });
}
export function useAssignNurse(patientId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (nurseUserId) => patientsApi.assignNurse(patientId, nurseUserId),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
            toast.success('Nurse assigned');
        },
        onError: reportFailure('Could not assign that nurse'),
    });
}
export function useRemoveNurse(patientId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (nurseUserId) => patientsApi.removeNurse(patientId, nurseUserId),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
            toast.success('Nurse removed from care team');
        },
        onError: reportFailure('Could not remove that nurse'),
    });
}
export function useSetPrimaryDoctor(patientId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (doctorUserId) => patientsApi.setPrimaryDoctor(patientId, doctorUserId),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
            toast.success('Primary doctor updated');
        },
        onError: reportFailure('Could not update the primary doctor'),
    });
}
/**
 * Discharge frees the bed as a side effect on the backend, so the bed caches
 * have to go too — otherwise the bed board keeps showing the bay as occupied
 * until someone reloads, and two people race for the same bed.
 */
export function useDischargePatient(patientId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input) => patientsApi.discharge(patientId, input),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
            void queryClient.invalidateQueries({ queryKey: queryKeys.beds.all });
            toast.success('Patient discharged');
        },
        onError: reportFailure('Could not discharge this patient'),
    });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { toast } from '@/shared/ui';
import { bedsApi, } from '../api/beds-api';
/**
 * Every bed mutation invalidates the patients cache as well as the beds cache.
 * Admitting a patient sets `isAdmitted` and `ward` on the patient record, so a
 * board that only refreshed itself would leave the patient list claiming the
 * person is still an outpatient.
 */
function useBedMutation(mutationFn, { success, failure }) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.beds.all });
            void queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
            toast.success(success);
        },
        onError: (error) => {
            toast.error(error instanceof ApiError ? error.userMessage : failure);
        },
    });
}
export function useBeds(params) {
    return useQuery({
        queryKey: queryKeys.beds.list(params),
        queryFn: () => bedsApi.list(params),
        placeholderData: (previous) => previous,
    });
}
export function useBed(id) {
    return useQuery({
        queryKey: queryKeys.beds.detail(id ?? ''),
        queryFn: () => bedsApi.getById(id),
        enabled: Boolean(id),
    });
}
export function useAvailableBeds(params) {
    return useQuery({
        queryKey: queryKeys.beds.available(params),
        queryFn: () => bedsApi.available(params),
    });
}
export function useOccupancy() {
    return useQuery({
        queryKey: queryKeys.beds.occupancy,
        queryFn: () => bedsApi.occupancy(),
    });
}
export function useWards() {
    return useQuery({
        queryKey: queryKeys.beds.wards,
        queryFn: () => bedsApi.wards(),
        // Wards are estate, not activity: they change when a building does.
        staleTime: 30 * 60_000,
    });
}
export function useAssignBed() {
    return useBedMutation(({ bedId, patientId }) => bedsApi.assign(bedId, patientId), { success: 'Patient admitted to bed', failure: 'Could not assign that bed' });
}
export function useTransferBed() {
    return useBedMutation(({ bedId, patientId }) => bedsApi.transfer(bedId, patientId), { success: 'Patient transferred', failure: 'Could not transfer that patient' });
}
export function useReleaseBed() {
    return useBedMutation((patientId) => bedsApi.release(patientId), {
        success: 'Bed released',
        failure: 'Could not release that bed',
    });
}
export function useSetBedStatus() {
    return useBedMutation(({ bedId, status }) => bedsApi.setStatus(bedId, status), { success: 'Bed status updated', failure: 'Could not update that bed' });
}
export function useCreateBed() {
    return useBedMutation((input) => bedsApi.create(input), {
        success: 'Bed added',
        failure: 'Could not add that bed',
    });
}
export function useUpdateBed() {
    return useBedMutation(({ id, ...input }) => bedsApi.update(id, input), { success: 'Bed updated', failure: 'Could not update that bed' });
}

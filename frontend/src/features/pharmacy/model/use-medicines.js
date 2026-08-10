import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { toast } from '@/shared/ui';
import { medicinesApi, } from '../api/medicines-api';
/**
 * Every write invalidates the whole medicines namespace.
 *
 * Stock is one number read through four lenses — the catalogue page, the
 * low-stock shelf, the expiring shelf, the batch detail — and dispensing five
 * vials moves all of them at once. Invalidating only the batch that changed
 * would leave a low-stock warning on screen for something that was just
 * restocked, which is exactly the reading someone acts on.
 */
function useMedicineMutation(mutationFn, { success, failure }) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.medicines.all });
            toast.success(success);
        },
        onError: (error) => {
            toast.error(error instanceof ApiError ? error.userMessage : failure);
        },
    });
}
export function useMedicines(params) {
    return useQuery({
        queryKey: queryKeys.medicines.list(params),
        queryFn: () => medicinesApi.list(params),
        placeholderData: (previous) => previous,
    });
}
export function useMedicine(id) {
    return useQuery({
        queryKey: queryKeys.medicines.detail(id ?? ''),
        queryFn: () => medicinesApi.getById(id),
        enabled: Boolean(id),
    });
}
/** Pharmacist-only; the hook is skippable so non-inventory staff never fire a 403. */
export function useLowStock(enabled = true) {
    return useQuery({
        queryKey: queryKeys.medicines.lowStock,
        queryFn: () => medicinesApi.lowStock(),
        enabled,
    });
}
export function useExpiringMedicines(days = 30, enabled = true) {
    return useQuery({
        queryKey: queryKeys.medicines.expiring(days),
        queryFn: () => medicinesApi.expiring(days),
        enabled,
    });
}
export function useCreateMedicine() {
    return useMedicineMutation((input) => medicinesApi.create(input), {
        success: 'Medicine added',
        failure: 'Could not add that medicine',
    });
}
export function useUpdateMedicine() {
    return useMedicineMutation(({ id, ...input }) => medicinesApi.update(id, input), { success: 'Medicine updated', failure: 'Could not update that medicine' });
}
export function useSetMedicineActive() {
    return useMedicineMutation(({ id, active }) => active ? medicinesApi.activate(id) : medicinesApi.deactivate(id), { success: 'Catalogue updated', failure: 'Could not change that batch' });
}
export function useRestockMedicine() {
    return useMedicineMutation(({ id, quantity }) => medicinesApi.restock(id, quantity), { success: 'Stock received', failure: 'Could not record that delivery' });
}
export function useDispenseMedicine() {
    return useMedicineMutation(({ id, ...input }) => medicinesApi.dispense(id, input), { success: 'Dispensed', failure: 'Could not dispense that quantity' });
}
export function useAdjustMedicine() {
    return useMedicineMutation(({ id, ...input }) => medicinesApi.adjust(id, input), { success: 'Stock adjusted', failure: 'Could not adjust that batch' });
}
/** Pulls every expired batch out of circulation in one sweep. */
export function useWithdrawExpired() {
    return useMedicineMutation(() => medicinesApi.withdrawExpired(), {
        success: 'Expired stock withdrawn',
        failure: 'Could not withdraw expired stock',
    });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { toast } from '@/shared/ui';

import {
  medicinesApi,
  type AdjustInput,
  type CreateMedicineInput,
  type MedicineListParams,
  type UpdateMedicineInput,
} from '../api/medicines-api';

/**
 * Every write invalidates the whole medicines namespace.
 *
 * Stock is one number read through four lenses — the catalogue page, the
 * low-stock shelf, the expiring shelf, the batch detail — and dispensing five
 * vials moves all of them at once. Invalidating only the batch that changed
 * would leave a low-stock warning on screen for something that was just
 * restocked, which is exactly the reading someone acts on.
 */
function useMedicineMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  { success, failure }: { success: string; failure: string }
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.medicines.all });
      toast.success(success);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.userMessage : failure);
    },
  });
}

export function useMedicines(params?: MedicineListParams) {
  return useQuery({
    queryKey: queryKeys.medicines.list(params),
    queryFn: () => medicinesApi.list(params),
    placeholderData: (previous) => previous,
  });
}

export function useMedicine(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.medicines.detail(id ?? ''),
    queryFn: () => medicinesApi.getById(id as string),
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
  return useMedicineMutation((input: CreateMedicineInput) => medicinesApi.create(input), {
    success: 'Medicine added',
    failure: 'Could not add that medicine',
  });
}

export function useUpdateMedicine() {
  return useMedicineMutation(
    ({ id, ...input }: { id: string } & UpdateMedicineInput) => medicinesApi.update(id, input),
    { success: 'Medicine updated', failure: 'Could not update that medicine' }
  );
}

export function useSetMedicineActive() {
  return useMedicineMutation(
    ({ id, active }: { id: string; active: boolean }) =>
      active ? medicinesApi.activate(id) : medicinesApi.deactivate(id),
    { success: 'Catalogue updated', failure: 'Could not change that batch' }
  );
}

export function useRestockMedicine() {
  return useMedicineMutation(
    ({ id, quantity }: { id: string; quantity: number }) => medicinesApi.restock(id, quantity),
    { success: 'Stock received', failure: 'Could not record that delivery' }
  );
}

export function useDispenseMedicine() {
  return useMedicineMutation(
    ({ id, ...input }: { id: string; quantity: number; reason?: string }) =>
      medicinesApi.dispense(id, input),
    { success: 'Dispensed', failure: 'Could not dispense that quantity' }
  );
}

export function useAdjustMedicine() {
  return useMedicineMutation(
    ({ id, ...input }: { id: string } & AdjustInput) => medicinesApi.adjust(id, input),
    { success: 'Stock adjusted', failure: 'Could not adjust that batch' }
  );
}

/** Pulls every expired batch out of circulation in one sweep. */
export function useWithdrawExpired() {
  return useMedicineMutation(() => medicinesApi.withdrawExpired(), {
    success: 'Expired stock withdrawn',
    failure: 'Could not withdraw expired stock',
  });
}

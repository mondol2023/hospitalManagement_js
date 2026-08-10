import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { toast } from '@/shared/ui';
import { billingApi, } from '../api/billing-api';
/**
 * Anything that moves money invalidates the whole bills namespace, not just the
 * one invoice: a payment changes the ledger's outstanding list and the revenue
 * summary at the same moment it changes the bill, and a screen showing a paid
 * invoice above a stale "outstanding" total is worse than one that is merely
 * slow.
 */
function useBillMutation(mutationFn, { success, failure }) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.bills.all });
            toast.success(success);
        },
        onError: (error) => {
            toast.error(error instanceof ApiError ? error.userMessage : failure);
        },
    });
}
export function useBills(params) {
    return useQuery({
        queryKey: queryKeys.bills.list(params),
        queryFn: () => billingApi.list(params),
        placeholderData: (previous) => previous,
    });
}
export function useBill(id) {
    return useQuery({
        queryKey: queryKeys.bills.detail(id ?? ''),
        queryFn: () => billingApi.getById(id),
        enabled: Boolean(id),
    });
}
export function usePatientBills(patientId) {
    return useQuery({
        queryKey: queryKeys.bills.byPatient(patientId ?? ''),
        queryFn: () => billingApi.listForPatient(patientId, { limit: 50 }),
        enabled: Boolean(patientId),
    });
}
export function useOutstandingBills(params) {
    return useQuery({
        queryKey: queryKeys.bills.outstanding(params),
        queryFn: () => billingApi.outstanding(params),
        placeholderData: (previous) => previous,
    });
}
export function useRevenue(params) {
    return useQuery({
        queryKey: queryKeys.bills.revenue(params),
        queryFn: () => billingApi.revenue(params),
    });
}
/**
 * Which methods this deployment can take. Cached hard: it is deployment
 * configuration, not activity, and it must resolve before the payment form can
 * offer anything at all.
 */
export function usePaymentMethods() {
    return useQuery({
        queryKey: ['bills', 'payment-methods'],
        queryFn: () => billingApi.paymentMethods(),
        staleTime: 60 * 60_000,
    });
}
export function useCreateBill() {
    return useBillMutation((input) => billingApi.create(input), {
        success: 'Invoice raised',
        failure: 'Could not raise that invoice',
    });
}
export function useBuildBillFromCare() {
    return useBillMutation(({ patientId, ...terms }) => billingApi.buildFromCare(patientId, terms), { success: 'Invoice built from care record', failure: 'Could not build that invoice' });
}
export function useUpdateBill() {
    return useBillMutation(({ id, ...input }) => billingApi.update(id, input), { success: 'Invoice updated', failure: 'Could not update that invoice' });
}
export function useAddBillItems() {
    return useBillMutation(({ id, items }) => billingApi.addItems(id, items), { success: 'Items added', failure: 'Could not add those items' });
}
export function useIssueBill() {
    return useBillMutation((id) => billingApi.issue(id), {
        success: 'Invoice issued',
        failure: 'Could not issue that invoice',
    });
}
export function useVoidBill() {
    return useBillMutation(({ id, reason }) => billingApi.void(id, reason), { success: 'Invoice voided', failure: 'Could not void that invoice' });
}
export function useRecordPayment() {
    return useBillMutation(({ id, ...input }) => billingApi.pay(id, input), { success: 'Payment recorded', failure: 'Could not record that payment' });
}
export function useRefundPayment() {
    return useBillMutation(({ id, ...input }) => billingApi.refund(id, input), { success: 'Refund issued', failure: 'Could not issue that refund' });
}

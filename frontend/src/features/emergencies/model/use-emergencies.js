import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { useSocketEvent } from '@/shared/realtime/useSocketEvent';
import { toast } from '@/shared/ui';
import { emergenciesApi, } from '../api/emergencies-api';
function useEmergencyMutation(mutationFn, { success, failure }) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.emergencies.all });
            toast.success(success);
        },
        onError: (error) => {
            toast.error(error instanceof ApiError ? error.userMessage : failure);
        },
    });
}
export function useEmergencies(params) {
    return useQuery({
        queryKey: queryKeys.emergencies.list(params),
        queryFn: () => emergenciesApi.list(params),
        placeholderData: (previous) => previous,
    });
}
/**
 * The live board.
 *
 * Polled on a half-minute as well as pushed over the socket. The socket is the
 * fast path and the poll is the honest one: a tablet whose connection dropped
 * silently would otherwise show an empty board and read as "nothing happening",
 * which is the single worst thing this screen can say.
 */
export function useActiveEmergencies(params) {
    return useQuery({
        queryKey: queryKeys.emergencies.active(params),
        queryFn: () => emergenciesApi.activeBoard(params),
        refetchInterval: 30_000,
        placeholderData: (previous) => previous,
    });
}
export function useEmergency(id) {
    return useQuery({
        queryKey: queryKeys.emergencies.detail(id ?? ''),
        queryFn: () => emergenciesApi.getById(id),
        enabled: Boolean(id),
    });
}
export function useOpenEmergencyCount(enabled = true) {
    return useQuery({
        queryKey: queryKeys.emergencies.count,
        queryFn: () => emergenciesApi.countOpen(),
        refetchInterval: 60_000,
        enabled,
    });
}
export function useEmergencyStats(params) {
    return useQuery({
        queryKey: [...queryKeys.emergencies.all, 'stats', params ?? {}],
        queryFn: () => emergenciesApi.stats(params),
    });
}
/**
 * Keeps every emergency query fresh from the broadcast.
 *
 * The payload is deliberately not written into the cache directly: the board is
 * sorted and filtered server-side, and splicing an alert into a page would put
 * a critical one at whatever position the array happened to have room for.
 * Invalidating costs one request and cannot mis-order the queue.
 */
export function useEmergencyAlerts(onAlert) {
    const queryClient = useQueryClient();
    const handler = useCallback((emergency) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.emergencies.all });
        onAlert?.(emergency);
    }, [queryClient, onAlert]);
    useSocketEvent('emergency:alert', handler);
}
export function useRaiseEmergency() {
    return useEmergencyMutation((input) => emergenciesApi.raise(input), {
        success: 'Alert raised — responders have been paged',
        failure: 'Could not raise that alert',
    });
}
export function useAcknowledgeEmergency() {
    return useEmergencyMutation((id) => emergenciesApi.acknowledge(id), {
        success: 'Acknowledged',
        failure: 'Could not acknowledge that alert',
    });
}
export function useResolveEmergency() {
    return useEmergencyMutation(({ id, notes }) => emergenciesApi.resolve(id, notes), { success: 'Alert resolved', failure: 'Could not resolve that alert' });
}
export function useEscalateEmergency() {
    return useEmergencyMutation(({ id, severity }) => emergenciesApi.escalate(id, severity), { success: 'Severity raised', failure: 'Could not escalate that alert' });
}

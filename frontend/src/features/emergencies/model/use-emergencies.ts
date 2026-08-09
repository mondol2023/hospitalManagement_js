import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { useSocketEvent } from '@/shared/realtime/useSocketEvent';
import type { Emergency, EmergencySeverity } from '@/shared/types/domain';
import { toast } from '@/shared/ui';

import {
  emergenciesApi,
  type ActiveBoardParams,
  type EmergencyListParams,
  type RaiseEmergencyInput,
} from '../api/emergencies-api';

function useEmergencyMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  { success, failure }: { success: string; failure: string }
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.emergencies.all });
      toast.success(success);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.userMessage : failure);
    },
  });
}

export function useEmergencies(params?: EmergencyListParams) {
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
export function useActiveEmergencies(params?: ActiveBoardParams) {
  return useQuery({
    queryKey: queryKeys.emergencies.active(params),
    queryFn: () => emergenciesApi.activeBoard(params),
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });
}

export function useEmergency(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.emergencies.detail(id ?? ''),
    queryFn: () => emergenciesApi.getById(id as string),
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

export function useEmergencyStats(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: [...queryKeys.emergencies.all, 'stats', params ?? {}] as const,
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
export function useEmergencyAlerts(onAlert?: (emergency: Emergency) => void) {
  const queryClient = useQueryClient();

  const handler = useCallback(
    (emergency: Emergency) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.emergencies.all });
      onAlert?.(emergency);
    },
    [queryClient, onAlert]
  );

  useSocketEvent('emergency:alert', handler);
}

export function useRaiseEmergency() {
  return useEmergencyMutation((input: RaiseEmergencyInput) => emergenciesApi.raise(input), {
    success: 'Alert raised — responders have been paged',
    failure: 'Could not raise that alert',
  });
}

export function useAcknowledgeEmergency() {
  return useEmergencyMutation((id: string) => emergenciesApi.acknowledge(id), {
    success: 'Acknowledged',
    failure: 'Could not acknowledge that alert',
  });
}

export function useResolveEmergency() {
  return useEmergencyMutation(
    ({ id, notes }: { id: string; notes: string }) => emergenciesApi.resolve(id, notes),
    { success: 'Alert resolved', failure: 'Could not resolve that alert' }
  );
}

export function useEscalateEmergency() {
  return useEmergencyMutation(
    ({ id, severity }: { id: string; severity: EmergencySeverity }) =>
      emergenciesApi.escalate(id, severity),
    { success: 'Severity raised', failure: 'Could not escalate that alert' }
  );
}

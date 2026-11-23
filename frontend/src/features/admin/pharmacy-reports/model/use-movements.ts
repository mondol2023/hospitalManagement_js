import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/shared/api/queryKeys';

import { reportsApi, type MovementParams } from '../api/reports-api';

/**
 * Previous rows stay while a new filter loads, so the table never flashes a
 * skeleton. `null` means there is nothing valid to ask for (the dates run
 * backwards), so nothing is sent.
 */
export function useMovements(params: MovementParams | null | undefined) {
  return useQuery({
    queryKey: queryKeys.medicines.movements(params ?? undefined),
    queryFn: () => reportsApi.movements(params ?? undefined),
    enabled: params !== null,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });
}

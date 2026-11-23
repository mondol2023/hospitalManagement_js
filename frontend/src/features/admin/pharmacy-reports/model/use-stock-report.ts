import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/shared/api/queryKeys';

import { reportsApi } from '../api/reports-api';

/**
 * Changing the window keeps the last report on screen until the new one lands.
 * No polling: the report is a decision aid, not a live board, so it refreshes
 * on window focus and after any stock write (the key sits under `medicines.all`).
 */
export function useStockReport(days: number) {
  return useQuery({
    queryKey: queryKeys.medicines.stockReport(days),
    queryFn: () => reportsApi.stockReport(days),
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });
}

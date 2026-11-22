import { useQuery } from '@tanstack/react-query';

import { useOutstandingBills } from '@/features/billing';
import { analyticsApi } from '@/features/dashboard';
import { queryKeys } from '@/shared/api/queryKeys';
import type { DateRange } from '@/shared/lib/hospital-day';

const OUTSTANDING_PAGE_SIZE = 20;
const TREND_METRIC = 'revenue.collectedCents';

/**
 * Money collected per day over `range`. `/bills/revenue` is a single total with
 * no time axis; the daily rollup lives in analytics. A role the backend does not
 * serve that series to gets a 403, which the page reads off `error.status` so it
 * can hide only the trend and keep the totals.
 *
 * Not `useMetricSeries`: that one blanks while a new range loads, and here the
 * old bars stay up (dimmed by the page) until the new ones land, the same as the
 * totals beside them.
 */
export function useRevenueTrend(range: DateRange) {
  const params = { period: 'daily', ...range } as const;
  return useQuery({
    queryKey: queryKeys.analytics.series(TREND_METRIC, params),
    queryFn: () => analyticsApi.series(TREND_METRIC, params),
    placeholderData: (previous) => previous,
  });
}

/** Unpaid and part-paid bills, oldest first, so the longest-waiting come up top. */
export function useOutstanding(page: number) {
  return useOutstandingBills({ page, limit: OUTSTANDING_PAGE_SIZE, sort: 'createdAt' });
}

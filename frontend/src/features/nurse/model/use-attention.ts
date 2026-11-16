import { useQueries } from '@tanstack/react-query';

import { careLogsApi } from '@/features/patients';
import { queryKeys } from '@/shared/api/queryKeys';
import type { CareLog } from '@/shared/types/domain';

import { entryTime } from './display';

const ATTENTION_LIMIT = 10;

/**
 * The attention queue for the wards a nurse works in.
 *
 * `/care-logs/attention` takes a single ward (or none, for the whole hospital),
 * so a nurse on two wards needs two requests, merged here. A float nurse — no
 * assigned wards — asks once without a ward and sees the hospital-wide queue.
 * Same 60 s refetch as the plain queue: no realtime until Phase 6.
 */
export function useAttentionForWards(
  wards: string[],
  { limit = ATTENTION_LIMIT, enabled = true }: { limit?: number; enabled?: boolean } = {}
) {
  const targets: Array<string | undefined> = wards.length > 0 ? wards : [undefined];

  const results = useQueries({
    queries: targets.map((ward) => {
      const params = { ward, limit };
      return {
        queryKey: queryKeys.careLogs.attention(params),
        queryFn: () => careLogsApi.attention(params),
        refetchInterval: 60_000,
        // An empty `wards` means "float nurse" only once the profile has said
        // so. Until then the caller disables this, or a nurse with a ward would
        // briefly ask for — and flash — the hospital-wide queue.
        enabled,
      };
    }),
  });

  const loaded = results.flatMap((result) => (result.data ? [result.data] : []));
  const items: CareLog[] = loaded
    .flatMap((page) => page.items)
    .sort((a, b) => entryTime(b).localeCompare(entryTime(a)))
    .slice(0, limit);

  return {
    items,
    total: loaded.reduce((sum, page) => sum + page.pagination.total, 0),
    // Skeleton only until the first answer: a refetch must not blank the panel.
    isLoading: loaded.length === 0 && results.some((result) => result.isLoading),
    // One ward failing while another answered still shows what we have.
    isError: loaded.length === 0 && results.some((result) => result.isError),
    error: results.find((result) => result.error)?.error ?? null,
    refetch: () => Promise.all(results.map((result) => result.refetch())),
  };
}

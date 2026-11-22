import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { medicinesApi, type ExpiryBatch } from '@/features/pharmacy';
import { queryKeys } from '@/shared/api/queryKeys';
import { isPast } from '@/shared/lib/hospital-day';

function byExpiry(a: ExpiryBatch, b: ExpiryBatch): number {
  return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
}

/**
 * The expiry shelf: one request, split into what has already expired and what
 * will within `days`.
 *
 * `/medicines/expiring` returns everything with `expiryDate <= now + days`,
 * expired batches included, so a second `/expired` call would only repeat rows.
 * The split uses the same clock and the same `<=` as the server's write-off, so
 * the "will be written off" list on screen is the list the sweep will take.
 */
export function useExpiryShelf(days: number, enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.medicines.expiring(days),
    queryFn: () => medicinesApi.expiring(days),
    enabled,
  });

  const { data } = query;
  const { expired, soon } = useMemo(() => {
    const now = new Date();
    const sorted = [...(data ?? [])].sort(byExpiry);
    return {
      expired: sorted.filter((batch) => isPast(batch.expiryDate, now)),
      soon: sorted.filter((batch) => !isPast(batch.expiryDate, now)),
    };
  }, [data]);

  return { ...query, expired, soon };
}

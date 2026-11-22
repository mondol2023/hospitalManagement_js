import { BedDouble } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useAvailableBeds, useWards } from '@/features/beds';
import { ApiError } from '@/shared/api/envelope';
import { cn } from '@/shared/lib/cn';
import { appPath } from '@/shared/lib/routes';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Skeleton } from '@/shared/ui';

const REFRESH_MS = 60_000;

/**
 * Free beds, counted per ward.
 *
 * `/beds/available` lists only beds that are free, so a ward with none simply
 * does not appear in it. The wards come from their own list and are counted
 * against it, which is what lets a full ward read "0 free" in words instead of
 * vanishing from the panel at the moment it matters most.
 *
 * There is no admit action here: admission stays on the bed board, where the
 * patient and the bed are both in view.
 */
export function FreeBedsPanel({ className }: { className?: string }) {
  const wards = useWards();
  const available = useAvailableBeds(undefined, { refetchInterval: REFRESH_MS });

  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const bed of available.data ?? []) {
      counts.set(bed.ward, (counts.get(bed.ward) ?? 0) + 1);
    }
    const names = new Set([...(wards.data ?? []), ...counts.keys()]);
    return [...names].sort((a, b) => a.localeCompare(b)).map((ward) => ({
      ward,
      free: counts.get(ward) ?? 0,
    }));
  }, [wards.data, available.data]);

  const loading = wards.isLoading || available.isLoading;
  const failed = wards.isError || available.isError;
  const totalFree = rows.reduce((sum, row) => sum + row.free, 0);

  return (
    <Card role="region" aria-label="Free beds" className={className}>
      <CardHeader
        title="Free beds"
        description={
          loading || failed || rows.length === 0 ? undefined : `${totalFree} free in total`
        }
      />

      {loading ? (
        <div role="status" aria-busy="true" aria-label="Loading free beds">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex justify-between border-b border-line px-4 py-3 last:border-0">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      ) : failed ? (
        <ErrorState
          title="Couldn’t load free beds"
          description={
            available.error instanceof ApiError || wards.error instanceof ApiError
              ? ((available.error ?? wards.error) as ApiError).userMessage
              : 'Check your connection and try again.'
          }
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (wards.isError) void wards.refetch();
                if (available.isError) void available.refetch();
              }}
            >
              Try again
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BedDouble}
          title="No wards set up yet."
          description="Beds are added on the beds page."
        />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map(({ ward, free }) => (
            <li key={ward}>
              <Link
                to={`${appPath('beds')}?ward=${encodeURIComponent(ward)}`}
                className={cn(
                  'flex items-center justify-between gap-3 px-4 py-2.5 text-sm outline-none',
                  'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
                  '[@media(hover:hover)]:hover:bg-surface-raised'
                )}
              >
                <span className="min-w-0 truncate font-medium" title={ward}>
                  {ward}
                </span>
                {free === 0 ? (
                  <Badge tone="warning">0 free</Badge>
                ) : (
                  <span className="shrink-0 tabular-nums">{free} free</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

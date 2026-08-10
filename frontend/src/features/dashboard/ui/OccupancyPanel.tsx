import { cn } from '@/shared/lib/cn';
import { Card, CardBody, CardHeader, EmptyState, SkeletonText } from '@/shared/ui';
import { BedDouble } from 'lucide-react';

import type { WardOccupancyRow } from '../api/analytics-api';

/**
 * Bar tone by pressure, not by taste.
 *
 * A ward at 95% is not "nearly full", it is a ward that cannot take the next
 * admission, and the board should say so before somebody wheels a patient down
 * the corridor to find out.
 */
function toneFor(rate: number): string {
  if (rate >= 90) return 'bg-danger';
  if (rate >= 75) return 'bg-warning';
  return 'bg-brand';
}

export function OccupancyPanel({
  wards,
  loading,
  className,
}: {
  wards: WardOccupancyRow[] | undefined;
  loading?: boolean;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader title="Ward occupancy" description="Live, from the bed board" />
      <CardBody className="space-y-3">
        {loading ? (
          <SkeletonText lines={5} />
        ) : !wards || wards.length === 0 ? (
          <EmptyState
            icon={BedDouble}
            title="No wards configured"
            description="Beds added to the system will appear here grouped by ward."
          />
        ) : (
          <ul className="space-y-3">
            {wards.map((ward) => (
              <li key={ward.ward}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{ward.ward}</span>
                  <span className="numeric shrink-0 text-xs text-muted">
                    {ward.occupied}/{ward.total} · {ward.occupancyRate}%
                  </span>
                </div>
                <div
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-raised"
                  role="img"
                  aria-label={`${ward.ward}: ${ward.occupied} of ${ward.total} beds occupied`}
                >
                  <div
                    className={cn('h-full rounded-full', toneFor(ward.occupancyRate))}
                    style={{ width: `${Math.min(100, ward.occupancyRate)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

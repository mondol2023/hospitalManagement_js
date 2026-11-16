import { ApiError } from '@/shared/api/envelope';
import { Button, Skeleton } from '@/shared/ui';

import { useWorkload } from '../model/use-nurse';
import { CapacityMeter } from './CapacityMeter';

/**
 * The signed-in nurse's patient count against their limit, with its own
 * loading and failure states so a slow or failed count never blocks the screen
 * around it. Shared by the dashboard strip and the workload page.
 */
export function WorkloadMeter({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const workload = useWorkload();

  if (workload.isLoading) {
    return (
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className={size === 'lg' ? 'h-4 w-full rounded-full' : 'h-2 w-full rounded-full'} />
      </div>
    );
  }

  if (!workload.data) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2" role="alert">
        <p className="text-sm text-muted">
          {workload.error instanceof ApiError
            ? workload.error.userMessage
            : 'Couldn’t load your patient count.'}
        </p>
        <Button size="sm" variant="secondary" onClick={() => void workload.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <CapacityMeter
      size={size}
      assigned={workload.data.assigned}
      capacity={workload.data.capacity}
      atCapacity={workload.data.atCapacity}
    />
  );
}

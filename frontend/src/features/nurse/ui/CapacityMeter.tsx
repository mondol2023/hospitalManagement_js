import { useId } from 'react';

import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui';

interface CapacityMeterProps {
  assigned: number;
  capacity: number;
  atCapacity: boolean;
  /** `lg` is the workload page; `sm` is the dashboard strip. */
  size?: 'sm' | 'lg';
  className?: string;
}

/**
 * How full a nurse's caseload is.
 *
 * Being at capacity changes the fill to the warning colour *and* adds the words
 * "At capacity" — colour is never the only signal. The fill is a scaled bar,
 * not a width change, so the only property that ever moves is a transform.
 */
export function CapacityMeter({
  assigned,
  capacity,
  atCapacity,
  size = 'sm',
  className,
}: CapacityMeterProps) {
  const labelId = useId();
  const ratio = capacity > 0 ? Math.min(assigned / capacity, 1) : 0;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          id={labelId}
          className={cn('font-display font-semibold', size === 'lg' ? 'text-lg' : 'text-sm')}
        >
          Your patients: {assigned} of {capacity}
        </span>
        {atCapacity && <Badge tone="warning">At capacity</Badge>}
      </div>

      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={assigned}
        aria-valuetext={`${assigned} of ${capacity} patients`}
        className={cn(
          'w-full overflow-hidden rounded-full bg-surface-raised',
          size === 'lg' ? 'h-4' : 'h-2'
        )}
      >
        <div
          className={cn(
            'h-full origin-left rounded-full transition-transform duration-300 motion-reduce:transition-none',
            atCapacity ? 'bg-warning' : 'bg-brand'
          )}
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
    </div>
  );
}

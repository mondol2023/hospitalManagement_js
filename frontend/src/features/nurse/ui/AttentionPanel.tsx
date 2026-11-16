import { CheckCircle2 } from 'lucide-react';

import { useAcknowledgeCareLog } from '@/features/patients';
import { ApiError } from '@/shared/api/envelope';
import type { CareLog } from '@/shared/types/domain';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Skeleton } from '@/shared/ui';

import { AttentionRow } from './AttentionRow';

interface AttentionPanelProps {
  items: CareLog[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  className?: string;
}

/**
 * Flagged entries nobody has picked up. The first nurse to acknowledge wins;
 * the hook handles losing that race, so this panel only renders the outcome.
 */
export function AttentionPanel({
  items,
  total,
  isLoading,
  isError,
  error,
  onRetry,
  className,
}: AttentionPanelProps) {
  const acknowledge = useAcknowledgeCareLog();
  const pendingId = acknowledge.isPending ? acknowledge.variables : undefined;

  return (
    <Card role="region" aria-label="Needs attention" className={className}>
      <CardHeader
        title="Needs attention"
        action={total > 0 ? <Badge tone="warning">{total}</Badge> : undefined}
      />

      {isLoading ? (
        <div role="status" aria-busy="true" aria-label="Loading entries that need attention">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2 px-4 py-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title="Couldn’t load what needs attention"
          description={
            error instanceof ApiError
              ? error.userMessage
              : 'Check your connection, then try again.'
          }
          action={
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          }
          className="py-8"
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing needs a second look."
          description="Flagged entries from your wards show up here until someone acknowledges them."
          className="py-8"
        />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((log) => (
            <AttentionRow
              key={log.id}
              log={log}
              acknowledging={pendingId === log.id}
              onAcknowledge={(logId) => acknowledge.mutate(logId)}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

import { Send } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useMyCareLogs, userName } from '@/features/patients';
import { ApiError } from '@/shared/api/envelope';
import { formatRelative, pluralize } from '@/shared/lib/format';
import { appPath } from '@/shared/lib/routes';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Skeleton } from '@/shared/ui';

import { entryTime, logPatientId, logPatientName } from '../model/display';

/** The handovers this nurse has sent, newest first — the record that they told someone. */
export function SentHandovers({ className }: { className?: string }) {
  const sent = useMyCareLogs({ type: 'handover', limit: 10 });
  const items = sent.data?.items ?? [];

  return (
    <Card role="region" aria-label="Sent handovers" className={className}>
      <CardHeader title="Sent handovers" />

      {sent.isLoading ? (
        <div role="status" aria-busy="true" aria-label="Loading sent handovers">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-0">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : sent.isError ? (
        <ErrorState
          title="Couldn’t load your sent handovers"
          description={
            sent.error instanceof ApiError ? sent.error.userMessage : 'Check your connection, then try again.'
          }
          action={
            <Button size="sm" variant="secondary" onClick={() => void sent.refetch()}>
              Try again
            </Button>
          }
          className="py-8"
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Send}
          title="You haven’t handed anything over yet."
          description="Handovers you send appear here, with who they went to."
          className="py-8"
        />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((log) => {
            const id = logPatientId(log.patient);
            const name = logPatientName(log.patient);
            const tasks = log.handover?.outstandingTasks?.length ?? 0;
            return (
              <li key={log.id} className="px-4 py-3">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {id ? (
                    <Link to={appPath(`patients/${id}`)} className="hover:text-brand hover:underline">
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                  {log.handover?.acceptedAt && <Badge tone="success">Accepted</Badge>}
                </p>
                {log.handover?.summary && (
                  <p className="mt-0.5 line-clamp-3 text-sm text-muted">{log.handover.summary}</p>
                )}
                <p className="mt-1 text-xs text-muted">
                  {[
                    `To ${userName(log.handover?.toNurse, 'a colleague')}`,
                    tasks > 0 && pluralize(tasks, 'task'),
                    formatRelative(entryTime(log)),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

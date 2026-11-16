import { motion } from 'framer-motion';
import { ChevronRight, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import { patientName, useCaseload } from '@/features/patients';
import { ApiError } from '@/shared/api/envelope';
import { appPath } from '@/shared/lib/routes';
import { fadeSlideUp } from '@/shared/motion/variants';
import { Button, Card, CardHeader, EmptyState, ErrorState, Skeleton } from '@/shared/ui';

import { bedLabel } from '../model/display';

/**
 * The nurse's plan for the shift: every admitted patient they are assigned to.
 *
 * `limit` is the nurse's own capacity, so a full caseload always fits on one
 * page — paging through your own patients would be a bug in the screen, not a
 * feature of it. While the capacity is still unknown (`limit` undefined) the
 * request waits and the skeleton shows, so the list is only ever fetched once.
 */
export function CaseloadPanel({
  limit,
  className,
}: {
  limit: number | undefined;
  className?: string;
}) {
  const caseload = useCaseload({ limit }, { enabled: limit !== undefined });
  const patients = caseload.data?.items ?? [];

  return (
    <Card role="region" aria-label="My patients" className={className}>
      <CardHeader title="My patients" />

      {limit === undefined || caseload.isLoading ? (
        <div role="status" aria-busy="true" aria-label="Loading your patients">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-0">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          ))}
        </div>
      ) : caseload.isError ? (
        <ErrorState
          title="Couldn’t load your patients"
          description={
            caseload.error instanceof ApiError
              ? caseload.error.userMessage
              : 'Check your connection, then try again.'
          }
          action={
            <Button size="sm" variant="secondary" onClick={() => void caseload.refetch()}>
              Try again
            </Button>
          }
        />
      ) : patients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No patients assigned to you yet."
          description="The charge nurse assigns patients from the ward board."
        />
      ) : (
        <motion.ul
          variants={fadeSlideUp}
          initial="hidden"
          animate="visible"
          className="divide-y divide-line"
        >
          {patients.map((patient) => {
            const bed = bedLabel(patient);
            return (
              <li key={patient.id}>
                <Link
                  to={appPath(`patients/${patient.id}`)}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-raised"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{patientName(patient)}</span>
                    <span className="mt-0.5 block text-xs text-muted">{bed ?? 'No bed assigned'}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </motion.ul>
      )}
    </Card>
  );
}

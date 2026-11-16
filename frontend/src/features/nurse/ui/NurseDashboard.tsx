import { useNurseProfile } from '@/features/profile';
import { ApiError } from '@/shared/api/envelope';
import { cn } from '@/shared/lib/cn';
import { Button, Card, CardBody, PageHeader, Skeleton } from '@/shared/ui';

import { useAttentionForWards } from '../model/use-attention';
import { useWorkload } from '../model/use-nurse';
import { AttentionPanel } from './AttentionPanel';
import { CapacityMeter } from './CapacityMeter';
import { CaseloadPanel } from './CaseloadPanel';
import { DutySwitch } from './DutySwitch';

/** The backend's default `maxPatients`, used only if the workload request fails. */
const FALLBACK_CAPACITY = 12;

/**
 * The first screen of a nurse's shift: a working view, not a metrics board.
 *
 * Caseload first — it is the plan for the shift — with "Needs attention" beside
 * it on wide screens, and above it on narrow ones when it has something in it.
 */
export function NurseDashboard({ name }: { name?: string }) {
  const profile = useNurseProfile();
  const workload = useWorkload();

  const wards = profile.data?.assignedWards ?? [];
  const attention = useAttentionForWards(wards, { enabled: profile.isSuccess });

  const limit = workload.isLoading ? undefined : (workload.data?.capacity ?? FALLBACK_CAPACITY);
  const isOnDuty = profile.data?.isOnDuty;
  const attentionLoading = profile.isLoading || attention.isLoading;
  const attentionFailed = profile.isError || attention.isError;

  return (
    <div>
      <PageHeader
        title={name ? `Good to see you, ${name.split(' ')[0]}` : 'Dashboard'}
        description="Your patients, and what needs a second look."
        action={
          profile.isLoading ? (
            <Skeleton className="h-9 w-28 rounded-full" />
          ) : isOnDuty === undefined ? null : (
            <DutySwitch isOnDuty={isOnDuty} />
          )
        }
      />

      {isOnDuty === false && (
        <p role="status" className="-mt-2 mb-4 text-sm text-muted">
          Colleagues can’t hand over to you while you’re off duty.
        </p>
      )}

      <Card className="mb-4">
        <CardBody>
          {workload.isLoading ? (
            <div aria-hidden="true" className="flex flex-col gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ) : workload.data ? (
            <CapacityMeter
              assigned={workload.data.assigned}
              capacity={workload.data.capacity}
              atCapacity={workload.data.atCapacity}
            />
          ) : (
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
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <CaseloadPanel limit={limit} />
        <AttentionPanel
          className={cn(attention.items.length > 0 && 'order-first lg:order-none')}
          items={attention.items}
          total={attention.total}
          isLoading={attentionLoading}
          isError={attentionFailed}
          error={profile.error ?? attention.error}
          onRetry={() => {
            if (profile.isError) void profile.refetch();
            void attention.refetch();
          }}
        />
      </div>
    </div>
  );
}

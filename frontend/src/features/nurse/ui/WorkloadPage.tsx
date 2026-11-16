import { ClipboardList } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useMyCareLogs } from '@/features/patients';
import { useNurseProfile } from '@/features/profile';
import { ApiError } from '@/shared/api/envelope';
import { humanizeEnum } from '@/shared/lib/format';
import { CARE_LOG_TYPES, type CareLogType } from '@/shared/types/domain';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
} from '@/shared/ui';

import { shiftWindow } from '../model/shift';
import { FeedRow } from './FeedRow';
import { WorkloadMeter } from './WorkloadMeter';

const PAGE_SIZE = 20;

/**
 * How the shift is going: the patient count against the limit, and everything
 * this nurse has recorded since the shift began.
 *
 * The window start is worked out once the profile has answered and then held,
 * so the list's query key does not change every render. If the profile cannot
 * be loaded the list still works, over the last twelve hours.
 */
export function WorkloadPage() {
  const [type, setType] = useState<CareLogType | ''>('');
  const [page, setPage] = useState(1);

  const profile = useNurseProfile();
  const settled = !profile.isLoading;
  const shift = profile.data?.shift;

  // Truncated to the minute so a re-render a second later asks the same question.
  const range = useMemo(() => {
    const { from, label } = shiftWindow(shift);
    from.setSeconds(0, 0);
    return { from: from.toISOString(), label };
  }, [shift]);

  const mine = useMyCareLogs(
    { from: range.from, type: type || undefined, page, limit: PAGE_SIZE },
    { enabled: settled }
  );
  const items = mine.data?.items ?? [];
  const waiting = !settled || mine.isLoading;

  return (
    <div>
      <PageHeader title="Workload" description="Your patient count, and what you have recorded." />

      <Card className="mb-4">
        <CardBody>
          <WorkloadMeter size="lg" />
        </CardBody>
      </Card>

      <Card role="region" aria-label="Your entries">
        <CardHeader
          // Don't claim a window until the profile has said which one.
          title={settled ? range.label : 'Your entries'}
          action={
            <Field label="Type" className="w-44">
              <Select
                value={type}
                onChange={(event) => {
                  setType(event.target.value as CareLogType | '');
                  setPage(1);
                }}
              >
                <option value="">All types</option>
                {CARE_LOG_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {humanizeEnum(value)}
                  </option>
                ))}
              </Select>
            </Field>
          }
        />

        {waiting ? (
          <div role="status" aria-busy="true" aria-label="Loading your entries">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-0"
              >
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : mine.isError ? (
          <ErrorState
            title="Couldn’t load your entries"
            description={
              mine.error instanceof ApiError
                ? mine.error.userMessage
                : 'Check your connection, then try again.'
            }
            action={
              <Button size="sm" variant="secondary" onClick={() => void mine.refetch()}>
                Try again
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={
              range.label === 'This shift'
                ? 'Nothing recorded this shift yet.'
                : 'Nothing recorded in the last 12 hours.'
            }
            description="Vitals, medications and notes you record show up here."
          />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {items.map((log) => (
                <FeedRow key={log.id} log={log} />
              ))}
            </ul>
            {mine.data && (
              <Pagination pagination={mine.data.pagination} onPageChange={setPage} unit="entry" />
            )}
          </>
        )}
      </Card>
    </div>
  );
}

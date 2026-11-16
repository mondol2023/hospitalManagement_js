import { CheckCircle2, ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useWards } from '@/features/beds';
import { useAcknowledgeCareLog, useAttentionLogs, useWardFeed } from '@/features/patients';
import { useNurseProfile } from '@/features/profile';
import { ApiError } from '@/shared/api/envelope';
import { humanizeEnum } from '@/shared/lib/format';
import { CARE_LOG_TYPES, type CareLogType } from '@/shared/types/domain';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
} from '@/shared/ui';

import { AttentionRow } from './AttentionRow';
import { FeedRow } from './FeedRow';

const PAGE_SIZE = 20;

/**
 * The nurses' station view of one ward: everything recorded there, newest
 * first, or only the flagged entries nobody has picked up.
 *
 * The ward comes from the link (`?ward=`), then the nurse's first assigned
 * ward, then the first ward on the estate — so a float nurse still lands on
 * something. No realtime until Phase 6; the attention queue refetches itself.
 */
export function WardPage() {
  const [params, setParams] = useSearchParams();
  const [type, setType] = useState<CareLogType | ''>('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [page, setPage] = useState(1);

  const profile = useNurseProfile();
  const wards = useWards();
  const acknowledge = useAcknowledgeCareLog();
  const pendingId = acknowledge.isPending ? acknowledge.variables : undefined;

  const assigned = profile.data?.assignedWards ?? [];
  const estate = wards.data ?? [];
  const requested = params.get('ward') ?? undefined;
  const ward = requested ?? assigned[0] ?? estate[0];
  const options = [...new Set([...assigned, ...estate, ...(requested ? [requested] : [])])];

  // Only wait for what could still change the answer.
  const resolving = !ward && (profile.isLoading || wards.isLoading);
  const noWards = !resolving && !ward;

  const feed = useWardFeed(attentionOnly ? undefined : ward, {
    page,
    limit: PAGE_SIZE,
    type: type || undefined,
  });
  const attention = useAttentionLogs(
    { ward, page, limit: PAGE_SIZE },
    { enabled: attentionOnly && Boolean(ward) }
  );
  const active = attentionOnly ? attention : feed;
  const items = active.data?.items ?? [];

  function chooseWard(next: string) {
    setParams({ ward: next }, { replace: true });
    setPage(1);
  }

  return (
    <div>
      <PageHeader title="Ward" description="What has been recorded on your ward.">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Ward" className="w-48">
            <Select
              value={ward ?? ''}
              disabled={options.length === 0}
              onChange={(event) => chooseWard(event.target.value)}
            >
              {options.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Type" className="w-44">
            <Select
              value={type}
              disabled={attentionOnly}
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

          <label className="flex h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={attentionOnly}
              onChange={(event) => {
                setAttentionOnly(event.target.checked);
                setPage(1);
              }}
            />
            Needs attention only
          </label>
        </div>
      </PageHeader>

      <Card role="region" aria-label="Ward feed">
        {resolving || (!noWards && active.isLoading) ? (
          <div role="status" aria-busy="true" aria-label="Loading the ward feed">
            {Array.from({ length: 5 }, (_, index) => (
              <div
                key={index}
                className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-0"
              >
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : noWards ? (
          <EmptyState
            icon={ClipboardList}
            title="No wards have been set up yet."
            description="Once an administrator adds beds, their wards appear here."
          />
        ) : active.isError ? (
          <ErrorState
            title="Couldn’t load the ward feed"
            description={
              active.error instanceof ApiError
                ? active.error.userMessage
                : 'Check your connection, then try again.'
            }
            action={
              <Button size="sm" variant="secondary" onClick={() => void active.refetch()}>
                Try again
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={attentionOnly ? CheckCircle2 : ClipboardList}
            title={
              attentionOnly
                ? `Nothing needs a second look on ${ward}.`
                : `Nothing recorded on ${ward} yet.`
            }
            description={
              attentionOnly
                ? 'Flagged entries show up here until someone acknowledges them.'
                : 'Entries appear here as nurses and doctors record them.'
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {items.map((log) =>
                attentionOnly ? (
                  <AttentionRow
                    key={log.id}
                    log={log}
                    acknowledging={pendingId === log.id}
                    onAcknowledge={(id) => acknowledge.mutate(id)}
                  />
                ) : (
                  <FeedRow
                    key={log.id}
                    log={log}
                    acknowledging={pendingId === log.id}
                    onAcknowledge={(id) => acknowledge.mutate(id)}
                  />
                )
              )}
            </ul>
            {active.data && (
              <Pagination pagination={active.data.pagination} onPageChange={setPage} unit="entry" />
            )}
          </>
        )}
      </Card>
    </div>
  );
}

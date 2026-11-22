import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, PackageCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useWithdrawExpired, type ExpiryBatch } from '@/features/pharmacy';
import { ApiError } from '@/shared/api/envelope';
import { formatDate, formatTime, pluralize } from '@/shared/lib/format';
import { fade, TRANSITION } from '@/shared/motion/variants';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Select, Skeleton } from '@/shared/ui';

import { daysToExpiry, EXPIRES_SOON_DAYS, expiresIn, quantityLabel } from '../model/display';
import { useExpiryShelf } from '../model/use-expiry';
import { useNow } from '../model/use-now';
import { WithdrawConfirm } from './WithdrawConfirm';

const LOOK_AHEAD = [7, 30, 90] as const;
const DEFAULT_DAYS = 30;

function daysFromParam(value: string | null): number {
  const days = Number(value);
  return LOOK_AHEAD.find((option) => option === days) ?? DEFAULT_DAYS;
}

function BatchName({ batch }: { batch: ExpiryBatch }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-[0.9375rem] font-medium" title={batch.name}>
        {batch.name}
      </span>
      <span className="block font-mono text-xs text-muted">{batch.batchNumber}</span>
    </span>
  );
}

const ROW =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_8rem_minmax(0,14rem)]';

function ShelfSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading expiry list">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-line px-4 py-3 last:border-0">
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

/**
 * `/app/pharmacy/expiry`: what has gone out of date, and what is about to.
 *
 * One request serves both sections: `/medicines/expiring` already includes
 * batches that have expired, and `useExpiryShelf` splits them on the same clock
 * the server's write-off uses, so the red list is exactly the list the sweep
 * will take. The look-ahead window lives in the URL.
 *
 * Writing off is the page's only mutation. It is not selectable per batch (the
 * backend sweeps every expired batch at once), so the dialog shows the whole
 * list and the result is reported from the server's numbers, not the dialog's.
 */
export function ExpiryPage() {
  const [params, setParams] = useSearchParams();
  const days = daysFromParam(params.get('days'));
  const now = useNow();

  const shelf = useExpiryShelf(days);
  const withdraw = useWithdrawExpired();

  // What was written off this visit. Hiding these at once, rather than waiting
  // for the refetch, is what lets the rows fade out and the panel collapse as one
  // gesture; if the server skipped a batch, the refetch brings it straight back.
  const [writtenOff, setWrittenOff] = useState<{ ids: ReadonlySet<string>; at: Date } | null>(null);
  const [reviewing, setReviewing] = useState<readonly ExpiryBatch[] | null>(null);

  const expired = useMemo(
    () => shelf.expired.filter((batch) => !writtenOff?.ids.has(batch.id)),
    [shelf.expired, writtenOff]
  );
  const expiredUnits = expired.reduce((sum, batch) => sum + batch.quantity, 0);
  const { soon } = shelf;

  function setDays(next: number) {
    setParams((current) => {
      const copy = new URLSearchParams(current);
      if (next === DEFAULT_DAYS) copy.delete('days');
      else copy.set('days', String(next));
      return copy;
    });
  }

  function openReview() {
    withdraw.reset();
    setReviewing(expired);
  }

  function confirm() {
    withdraw.mutate(undefined, {
      onSuccess: (result) => {
        setReviewing(null);
        if (result.withdrawn > 0) {
          setWrittenOff({ ids: new Set(result.items.map((item) => item.id)), at: new Date() });
        }
      },
    });
  }

  const nothingDue = expired.length === 0 && soon.length === 0;

  return (
    <motion.div variants={fade} initial="hidden" animate="visible">
      <PageHeader
        title="Expiry"
        description="Batches that have expired, and those about to."
        action={
          <label className="flex items-center gap-2 text-sm text-muted">
            Look ahead
            <Select
              inputSize="sm"
              className="w-28 text-content"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              {LOOK_AHEAD.map((option) => (
                <option key={option} value={option}>
                  {option} days
                </option>
              ))}
            </Select>
          </label>
        }
      />

      {writtenOff && (
        <p role="status" className="-mt-2 mb-4 text-sm text-muted">
          Written off today at <span className="tabular-nums">{formatTime(writtenOff.at)}</span> by you
        </p>
      )}

      {shelf.isLoading ? (
        <Card>
          <ShelfSkeleton />
        </Card>
      ) : shelf.isError && !shelf.data ? (
        <Card>
          <ErrorState
            title="Couldn’t load the expiry list"
            description={
              shelf.error instanceof ApiError
                ? shelf.error.userMessage
                : 'Check your connection and try again.'
            }
            action={
              <Button size="sm" variant="secondary" onClick={() => void shelf.refetch()}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <AnimatePresence initial={false}>
            {expired.length > 0 && (
              <motion.section
                key="expired"
                aria-label="Expired batches"
                className="overflow-hidden rounded-card border border-danger/30 bg-danger-soft"
                exit={{
                  height: 0,
                  opacity: 0,
                  marginTop: 0,
                  // The rows fade first; the panel closes after them.
                  transition: { ...TRANSITION.exit, delay: TRANSITION.exit.duration },
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-danger">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    Expired
                    <span className="font-sans font-normal text-content">
                      · {pluralize(expired.length, 'batch', 'batches')} ·{' '}
                      <span className="tabular-nums">{pluralize(expiredUnits, 'unit')}</span>
                    </span>
                  </h2>
                  <Button size="sm" variant="secondary" onClick={openReview}>
                    Withdraw expired…
                  </Button>
                </div>

                <motion.ul
                  className="divide-y divide-danger/20 border-t border-danger/20"
                  exit={{ opacity: 0, transition: TRANSITION.exit }}
                >
                  {expired.map((batch) => (
                    <li key={batch.id} className={ROW}>
                      <BatchName batch={batch} />
                      <span className="tabular-nums md:text-right">
                        {quantityLabel(batch.quantity, batch.unit)}
                      </span>
                      <span className="col-span-2 text-sm text-muted md:col-span-1">
                        Expired <span className="tabular-nums">{formatDate(batch.expiryDate)}</span>
                      </span>
                    </li>
                  ))}
                </motion.ul>
              </motion.section>
            )}
          </AnimatePresence>

          {soon.length > 0 && (
            <Card role="region" aria-label="Expiring soon">
              <CardHeader
                title={`Expiring in the next ${days} days`}
                description={pluralize(soon.length, 'batch', 'batches')}
              />
              <ul className="divide-y divide-line">
                {soon.map((batch) => {
                  const remaining = daysToExpiry(batch.expiryDate, now);
                  return (
                    <li key={batch.id} className={ROW}>
                      <BatchName batch={batch} />
                      <span className="tabular-nums md:text-right">
                        {quantityLabel(batch.quantity, batch.unit)}
                      </span>
                      <span className="col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm md:col-span-1">
                        <span className="tabular-nums">{formatDate(batch.expiryDate)}</span>
                        <span className="text-muted">{expiresIn(remaining)}</span>
                        {remaining <= EXPIRES_SOON_DAYS && <Badge tone="warning">Expires soon</Badge>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {nothingDue && (
            <Card>
              <EmptyState
                icon={PackageCheck}
                title={`Nothing expires in the next ${days} days.`}
                action={
                  days < 90 ? (
                    <Button size="sm" variant="link" onClick={() => setDays(90)}>
                      Look 90 days ahead
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          )}
        </div>
      )}

      <WithdrawConfirm
        open={reviewing !== null}
        onOpenChange={(open) => !open && setReviewing(null)}
        batches={reviewing ?? []}
        busy={withdraw.isPending}
        failed={withdraw.isError}
        onConfirm={confirm}
      />
    </motion.div>
  );
}

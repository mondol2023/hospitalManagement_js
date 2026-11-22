import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useRevenue } from '@/features/billing';
import { ApiError } from '@/shared/api/envelope';
import { cn } from '@/shared/lib/cn';
import { toDateInputValue, pluralize } from '@/shared/lib/format';
import { customDayRange, lastDaysRange, type DateRange } from '@/shared/lib/hospital-day';
import { formatMoney } from '@/shared/lib/money';
import { fade } from '@/shared/motion/variants';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Pagination,
  Skeleton,
} from '@/shared/ui';

import { openBills, owingState } from '../model/display';
import { useNow } from '../model/use-now';
import { useOutstanding, useRevenueTrend } from '../model/use-revenue';
import { CollectedMeter } from './CollectedMeter';
import { OutstandingTable } from './OutstandingTable';
import { RangeControl, type RangeChoice } from './RangeControl';
import { TrendBars } from './TrendBars';

const DEFAULT_DAYS = 30;
const PRESETS = [7, 30, 90] as const;
const RANGE_ERROR = 'Start date must be before the end date.';

const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const dayYearFmt = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** The statuses the breakdown lists, in the order it lists them. */
const BREAKDOWN = [
  { status: 'unpaid', label: 'Unpaid' },
  { status: 'partially_paid', label: 'Part paid' },
  { status: 'paid', label: 'Paid' },
] as const;

function pageFromParam(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/**
 * Reads the window out of the URL. Anything it cannot use (an unknown preset, or
 * a custom range that is not a range) falls back to the last 30 days instead of
 * sending a request the server would refuse.
 */
function readRange(
  params: URLSearchParams,
  now: Date
): { choice: RangeChoice; range: DateRange; fromDay: string; toDay: string } {
  const preset = PRESETS.find((days) => String(days) === params.get('range'));
  if (preset) {
    const range = lastDaysRange(preset, now);
    return { choice: preset, range, fromDay: toDateInputValue(range.from), toDay: toDateInputValue(range.to) };
  }

  const fromDay = params.get('from') ?? '';
  const toDay = params.get('to') ?? '';
  const custom = params.get('range') === 'custom' ? customDayRange(fromDay, toDay) : null;
  if (custom) return { choice: 'custom', range: custom, fromDay, toDay };

  const range = lastDaysRange(DEFAULT_DAYS, now);
  return {
    choice: DEFAULT_DAYS,
    range,
    fromDay: toDateInputValue(range.from),
    toDay: toDateInputValue(range.to),
  };
}

function describeWindow({ from, to }: DateRange, now: Date): string {
  const start = new Date(from);
  const end = new Date(to);
  const plain = start.getFullYear() === end.getFullYear() && end.getFullYear() === now.getFullYear();
  const fmt = plain ? dayFmt : dayYearFmt;
  return `Bills raised ${fmt.format(start)} – ${fmt.format(end)}`;
}

function Loading({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="space-y-3 p-4">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}

function retryAction(onRetry: () => void) {
  return (
    <Button size="sm" variant="secondary" onClick={onRetry}>
      Try again
    </Button>
  );
}

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.userMessage : 'Check your connection and try again.';
}

/**
 * `/app/billing/revenue`: what came in, and who still owes.
 *
 * The window is in the URL (`?range=7|30|90` or `?range=custom&from=&to=`), so a
 * link or a refresh lands on the same figures. It drives the summary and the
 * daily trend. The outstanding list is not windowed: it is every unpaid bill,
 * oldest first, because the ones that matter most are the ones raised long ago.
 *
 * The window is by date *raised* (the server filters on `createdAt`), which is
 * why the heading says "Bills raised" and never "issued" (spec O3). Each panel
 * loads and fails on its own, so a refused trend (a 403 for a role analytics
 * does not serve) takes down only the trend.
 *
 * Nothing here animates a figure while it is being read. A new range dims the
 * old numbers until the new ones land; they never count up or down.
 */
export function RevenuePage() {
  const [params, setParams] = useSearchParams();
  const now = useNow();

  const { choice, range, fromDay, toDay } = readRange(params, now);
  const page = pageFromParam(params.get('page'));

  const revenue = useRevenue(range);
  const trend = useRevenueTrend(range);
  const owed = useOutstanding(page);

  // The custom inputs hold what is being typed, which is often not yet a range.
  // Only a valid pair reaches the URL (and so the server).
  const [draft, setDraft] = useState({ from: fromDay, to: toDay });
  useEffect(() => setDraft({ from: fromDay, to: toDay }), [fromDay, toDay]);
  const draftInvalid =
    choice === 'custom' && draft.from !== '' && draft.to !== '' && !customDayRange(draft.from, draft.to);

  function update(changes: Record<string, string | undefined>) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    });
  }

  function choose(next: RangeChoice) {
    if (next === 'custom') {
      // Start from the window that was showing, so the first look is not blank.
      update({ range: 'custom', from: fromDay, to: toDay });
    } else {
      update({ range: next === DEFAULT_DAYS ? undefined : String(next), from: undefined, to: undefined });
    }
  }

  function editDraft(changes: Partial<typeof draft>) {
    const next = { ...draft, ...changes };
    setDraft(next);
    if (customDayRange(next.from, next.to)) update({ range: 'custom', from: next.from, to: next.to });
  }

  const summary = revenue.data;
  const rows = owed.data?.items ?? [];
  const pagination = owed.data?.pagination;
  const overdueHere = rows.filter((bill) => owingState(bill, now) === 'overdue').length;

  const trendRefused = trend.error instanceof ApiError && trend.error.status === 403;

  // The bars rise from the baseline the first time a trend is drawn and never
  // again: a later range remounts the chart, and replaying it on every click
  // would be decoration on a figure someone is about to read.
  const trendDrawn = useRef(false);
  const riseBars = !trendDrawn.current;
  useEffect(() => {
    if (trend.data) trendDrawn.current = true;
  }, [trend.data]);

  return (
    <motion.div variants={fade} initial="hidden" animate="visible">
      <PageHeader title="Revenue" description={describeWindow(range, now)}>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <RangeControl value={choice} onChange={choose} />

          {choice === 'custom' && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label className="flex items-center gap-2 text-sm text-muted">
                From
                <Input
                  type="date"
                  inputSize="sm"
                  className="w-40"
                  value={draft.from}
                  max={draft.to || undefined}
                  aria-invalid={draftInvalid || undefined}
                  onChange={(event) => editDraft({ from: event.target.value })}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-muted">
                To
                <Input
                  type="date"
                  inputSize="sm"
                  className="w-40"
                  value={draft.to}
                  min={draft.from || undefined}
                  aria-invalid={draftInvalid || undefined}
                  onChange={(event) => editDraft({ to: event.target.value })}
                />
              </label>
              {draftInvalid && (
                <p role="alert" className="text-sm text-danger">
                  {RANGE_ERROR}
                </p>
              )}
            </div>
          )}
        </div>
      </PageHeader>

      <div className="space-y-4">
        <Card
          role="region"
          aria-label="Summary"
          className={cn('transition-opacity duration-100', revenue.isPlaceholderData && 'opacity-60')}
        >
          {revenue.isLoading ? (
            <Loading label="Loading revenue summary" />
          ) : revenue.isError && !summary ? (
            <ErrorState
              title="Couldn’t load the revenue summary"
              description={errorText(revenue.error)}
              action={retryAction(() => void revenue.refetch())}
            />
          ) : summary ? (
            <div className="space-y-4 p-4">
              <CollectedMeter billedCents={summary.billedCents} collectedCents={summary.collectedCents} />

              <p className="text-sm">
                Outstanding{' '}
                <span className="font-medium tabular-nums">{formatMoney(summary.outstandingCents)}</span>
                {' · '}
                {pluralize(openBills(summary), 'bill')}
              </p>

              <ul aria-label="By status" className="grid gap-2 border-t border-line pt-3 sm:grid-cols-3">
                {BREAKDOWN.map(({ status, label }) => {
                  const row = summary.byStatus[status];
                  return (
                    <li key={status} className="text-sm">
                      <span className="font-medium">{label}</span>
                      <span className="text-muted">
                        {' · '}
                        {pluralize(row?.count ?? 0, 'bill')}
                        {' · '}
                        <span className="tabular-nums">{formatMoney(row?.billedCents ?? 0)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </Card>

        <Card
          role="region"
          aria-label="Daily trend"
          className={cn('transition-opacity duration-100', trend.isPlaceholderData && 'opacity-60')}
        >
          <CardHeader title="Collected per day" />
          <div className="p-4">
            {trend.isLoading ? (
              <Loading label="Loading daily trend" />
            ) : trendRefused ? (
              <p className="text-sm text-muted">The daily trend isn’t available for your role.</p>
            ) : trend.isError && !trend.data ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted">Couldn’t load the daily trend.</p>
                {retryAction(() => void trend.refetch())}
              </div>
            ) : trend.data ? (
              <TrendBars
                key={`${range.from}|${range.to}`}
                points={trend.data.points}
                truncated={trend.data.truncated}
                rise={riseBars}
              />
            ) : null}
          </div>
        </Card>

        <Card
          role="region"
          aria-label="Outstanding"
          className={cn('transition-opacity duration-100', owed.isPlaceholderData && 'opacity-60')}
        >
          <CardHeader
            title="Outstanding"
            description={
              pagination
                ? `${pluralize(pagination.total, 'bill')}, oldest first${
                    overdueHere > 0 ? ` · ${overdueHere} overdue on this page` : ''
                  }`
                : 'Every unpaid bill, oldest first'
            }
          />
          {owed.isLoading ? (
            <Loading label="Loading outstanding bills" />
          ) : owed.isError && !owed.data ? (
            <ErrorState
              title="Couldn’t load outstanding bills"
              description={errorText(owed.error)}
              action={retryAction(() => void owed.refetch())}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title="Nothing outstanding."
              description="Bills are raised from the billing page."
            />
          ) : (
            <>
              <OutstandingTable bills={rows} now={now} />
              {pagination && (
                <Pagination
                  pagination={pagination}
                  unit="bill"
                  onPageChange={(next) => update({ page: next > 1 ? String(next) : undefined })}
                />
              )}
            </>
          )}
        </Card>
      </div>
    </motion.div>
  );
}

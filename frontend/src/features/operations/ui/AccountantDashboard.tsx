import { useMemo } from 'react';

import { useRevenue } from '@/features/billing';
import { pluralize } from '@/shared/lib/format';
import { lastDaysRange } from '@/shared/lib/hospital-day';
import { formatMoney } from '@/shared/lib/money';
import { appPath } from '@/shared/lib/routes';
import { Button, Card, CardHeader, EmptyState, ErrorState, PageHeader } from '@/shared/ui';

import { openBills, owingState } from '../model/display';
import { failureText } from '../model/failure-text';
import { useNow } from '../model/use-now';
import { useOutstanding } from '../model/use-revenue';
import { CollectedMeter } from './CollectedMeter';
import { PanelSkeleton, Reveal, SeeAll } from './DashboardParts';
import { OutstandingTable } from './OutstandingTable';
import { Signpost } from './Signpost';

const SHOWN = 6;
const WINDOW_DAYS = 30;

const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

/**
 * The accountant's first screen: how much came in, and who still owes.
 *
 * It reads the same two queries as the revenue page (the same 30-day window and
 * the same first page of outstanding bills), so going from one to the other is
 * a cache hit and not two more requests.
 *
 * Overdue is counted on that first page only. The server has no hospital-wide
 * overdue total (spec O4), so when the whole page is overdue and there are more
 * pages the sign says "20+" instead of a number it cannot back.
 */
export function AccountantDashboard({ name }: { name?: string }) {
  const now = useNow();
  const range = lastDaysRange(WINDOW_DAYS, now);

  const revenue = useRevenue(range);
  const owed = useOutstanding(1);

  const rows = useMemo(() => owed.data?.items ?? [], [owed.data]);
  const overdue = rows.filter((bill) => owingState(bill, now) === 'overdue');
  const morePages = (owed.data?.pagination.totalPages ?? 1) > 1;
  const oldest = overdue[0];

  const sign = oldest && {
    to: appPath('billing/revenue'),
    text: `${overdue.length === rows.length && morePages ? `${overdue.length}+` : overdue.length} ${
      overdue.length === 1 ? 'bill' : 'bills'
    } overdue · Oldest from ${dayMonth.format(new Date(oldest.createdAt))}`,
  };

  const summary = revenue.data;

  return (
    <div>
      <PageHeader
        title={name ? `Good to see you, ${name.split(' ')[0]}` : 'Dashboard'}
        description="What came in, and who still owes."
      />

      <div className="mb-4">
        <Signpost options={[sign]} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start">
        <Reveal index={0}>
          <Card role="region" aria-label={`Last ${WINDOW_DAYS} days`}>
            <CardHeader title={`Last ${WINDOW_DAYS} days`} description="Bills raised in this period" />

            {revenue.isLoading ? (
              <PanelSkeleton label="Loading revenue summary" />
            ) : revenue.isError && !summary ? (
              <ErrorState
                title="Couldn’t load the revenue summary"
                description={failureText(revenue.error)}
                action={
                  <Button size="sm" variant="secondary" onClick={() => void revenue.refetch()}>
                    Try again
                  </Button>
                }
              />
            ) : summary ? (
              <div className="space-y-3 p-4">
                <CollectedMeter billedCents={summary.billedCents} collectedCents={summary.collectedCents} />
                <p className="text-sm">
                  Outstanding{' '}
                  <span className="font-medium tabular-nums">{formatMoney(summary.outstandingCents)}</span>
                  {' · '}
                  {pluralize(openBills(summary), 'bill')}
                </p>
              </div>
            ) : null}
          </Card>
        </Reveal>

        <Reveal index={1}>
          <Card role="region" aria-label="Oldest unpaid">
            <CardHeader
              title="Oldest unpaid"
              action={<SeeAll to={appPath('billing/revenue')}>Open revenue</SeeAll>}
            />

            {owed.isLoading ? (
              <PanelSkeleton label="Loading outstanding bills" />
            ) : owed.isError && !owed.data ? (
              <ErrorState
                title="Couldn’t load outstanding bills"
                description={failureText(owed.error)}
                action={
                  <Button size="sm" variant="secondary" onClick={() => void owed.refetch()}>
                    Try again
                  </Button>
                }
              />
            ) : rows.length === 0 ? (
              <EmptyState
                title="Nothing outstanding."
                description="Bills are raised from the billing page."
              />
            ) : (
              <OutstandingTable bills={rows.slice(0, SHOWN)} now={now} />
            )}
          </Card>
        </Reveal>
      </div>
    </div>
  );
}

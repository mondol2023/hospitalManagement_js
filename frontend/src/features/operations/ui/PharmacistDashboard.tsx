import { PackageCheck, PillBottle } from 'lucide-react';

import { useLowStock } from '@/features/pharmacy';
import { formatDate, pluralize } from '@/shared/lib/format';
import { appPath } from '@/shared/lib/routes';
import { Button, Card, CardHeader, EmptyState, ErrorState, PageHeader } from '@/shared/ui';

import { daysToExpiry, expiresIn, quantityLabel } from '../model/display';
import { failureText } from '../model/failure-text';
import { useExpiryShelf } from '../model/use-expiry';
import { PanelSkeleton, Reveal, SeeAll } from './DashboardParts';
import { Signpost } from './Signpost';

const SHOWN = 6;
/** How far ahead the dashboard looks. The expiry page lets people widen it. */
const LOOK_AHEAD_DAYS = 30;

/**
 * The pharmacist's first screen: what is about to run out, and what is about to
 * go out of date.
 *
 * It only ever points at the expiry page. Writing stock off happens there, behind
 * its own confirm step, never from a dashboard someone glances at between
 * customers.
 */
export function PharmacistDashboard({ name }: { name?: string }) {
  const shelf = useExpiryShelf(LOOK_AHEAD_DAYS);
  const low = useLowStock();

  const expiredCount = shelf.expired.length;
  const nextBatch = shelf.soon[0];

  const sign =
    expiredCount > 0
      ? {
          to: appPath('pharmacy/expiry'),
          text: `${pluralize(expiredCount, 'batch', 'batches')} ${expiredCount === 1 ? 'has' : 'have'} expired · Review and withdraw`,
        }
      : nextBatch && {
          to: appPath('pharmacy/expiry'),
          text: `Next expiry ${expiresIn(daysToExpiry(nextBatch.expiryDate))} · ${nextBatch.name}`,
        };

  return (
    <div>
      <PageHeader
        title={name ? `Good to see you, ${name.split(' ')[0]}` : 'Dashboard'}
        description="What is running low, and what is close to its date."
      />

      <div className="mb-4">
        <Signpost options={[sign]} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Reveal index={0}>
          <Card role="region" aria-label="Low stock">
            <CardHeader
              title="Low stock"
              description={
                low.data && low.data.length > 0 ? `${low.data.length} below reorder level` : undefined
              }
              action={<SeeAll to={appPath('pharmacy')}>Open pharmacy</SeeAll>}
            />

            {low.isLoading ? (
              <PanelSkeleton label="Loading low stock" />
            ) : low.isError ? (
              <ErrorState
                title="Couldn’t load low stock"
                description={failureText(low.error)}
                action={
                  <Button size="sm" variant="secondary" onClick={() => void low.refetch()}>
                    Try again
                  </Button>
                }
              />
            ) : (low.data ?? []).length === 0 ? (
              <EmptyState icon={PackageCheck} title="Nothing is below its reorder level." />
            ) : (
              <ul className="divide-y divide-line">
                {(low.data ?? []).slice(0, SHOWN).map((medicine) => (
                  <li key={medicine.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <span className="min-w-0 truncate text-[0.9375rem] font-medium" title={medicine.name}>
                      {medicine.name}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted">
                      {`${medicine.quantity} of ${quantityLabel(medicine.reorderLevel, medicine.unit)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Reveal>

        <Reveal index={1}>
          <Card role="region" aria-label="Expiring soon">
            <CardHeader
              title="Expiring soon"
              description={
                shelf.soon.length > 0 ? `Next ${LOOK_AHEAD_DAYS} days · ${pluralize(shelf.soon.length, 'batch', 'batches')}` : undefined
              }
              action={<SeeAll to={appPath('pharmacy/expiry')}>Review expiry</SeeAll>}
            />

            {shelf.isLoading ? (
              <PanelSkeleton label="Loading expiry dates" />
            ) : shelf.isError && !shelf.data ? (
              <ErrorState
                title="Couldn’t load expiry dates"
                description={failureText(shelf.error)}
                action={
                  <Button size="sm" variant="secondary" onClick={() => void shelf.refetch()}>
                    Try again
                  </Button>
                }
              />
            ) : shelf.soon.length === 0 ? (
              <EmptyState
                icon={PillBottle}
                title={`Nothing expires in the next ${LOOK_AHEAD_DAYS} days.`}
              />
            ) : (
              <ul className="divide-y divide-line">
                {shelf.soon.slice(0, SHOWN).map((batch) => (
                  <li
                    key={batch.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 px-4 py-2.5"
                  >
                    <span className="min-w-0 truncate text-[0.9375rem] font-medium" title={batch.name}>
                      {batch.name}
                    </span>
                    <span className="justify-self-end text-sm tabular-nums">
                      {formatDate(batch.expiryDate)}
                    </span>
                    <span className="text-sm text-muted">
                      <span className="font-mono text-xs">{batch.batchNumber}</span>
                      {' · '}
                      <span className="tabular-nums">{quantityLabel(batch.quantity, batch.unit)}</span>
                    </span>
                    <span className="justify-self-end text-sm text-muted">
                      {expiresIn(daysToExpiry(batch.expiryDate))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Reveal>
      </div>
    </div>
  );
}

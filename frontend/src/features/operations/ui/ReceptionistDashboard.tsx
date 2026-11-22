import { CalendarX2 } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import type { ArrivalAppointment } from '@/features/appointments';
import { useLiveBoard } from '@/features/dashboard';
import { formatTime } from '@/shared/lib/format';
import { todayRange } from '@/shared/lib/hospital-day';
import { appPath } from '@/shared/lib/routes';
import { Button, Card, CardHeader, EmptyState, ErrorState, PageHeader } from '@/shared/ui';

import { doctorLabel, patientLabel } from '../model/display';
import { failureText } from '../model/failure-text';
import { useArrivals, useConfirmArrival } from '../model/use-front-desk';
import { useNow } from '../model/use-now';
import { ArrivalRow } from './ArrivalRow';
import { PanelSkeleton, Reveal, SeeAll } from './DashboardParts';
import { FreeBedsPanel } from './FreeBedsPanel';
import { Signpost } from './Signpost';

const SHOWN = 6;

/** A visit that someone at the desk still has to do something about. */
function isOpen(row: ArrivalAppointment): boolean {
  return row.status === 'pending' || row.status === 'confirmed';
}

/**
 * The receptionist's first screen: what is coming through the door, and whether
 * there is a bed if someone needs one.
 *
 * It reads the same arrivals query as the front desk (same params, so one cache
 * entry and one request between the two screens). Only the first page is read;
 * on a day with more than a page of visits the "next" ones are the next of those.
 */
export function ReceptionistDashboard({ name }: { name?: string }) {
  const now = useNow();
  const arrivals = useArrivals(todayRange(now));
  const confirm = useConfirmArrival();
  const live = useLiveBoard();

  const rows = useMemo(() => arrivals.data?.items ?? [], [arrivals.data]);
  const open = useMemo(() => rows.filter(isOpen), [rows]);
  const total = arrivals.data?.pagination.total;

  const next = open.find((row) => new Date(row.scheduledAt).getTime() > now.getTime());
  const nextSign = next && {
    to: appPath('front-desk'),
    text: [
      `Next arrival ${formatTime(next.scheduledAt)} · ${patientLabel(next.patient).name}`,
      doctorLabel(next.doctor) && `with ${doctorLabel(next.doctor)}`,
    ]
      .filter(Boolean)
      .join(' '),
  };

  const emergencies = live.data?.openEmergencies ?? 0;
  const confirmingId = confirm.isPending ? confirm.variables?.id : undefined;

  return (
    <div>
      <PageHeader
        title={name ? `Good to see you, ${name.split(' ')[0]}` : 'Dashboard'}
        description="Who is arriving today, and which beds are free."
      />

      <div className="mb-4 space-y-3">
        <Signpost options={[nextSign]} />

        {emergencies > 0 && (
          <Link
            to={appPath('emergencies')}
            className="flex items-center gap-2 rounded-control border border-danger/40 bg-danger-soft px-4 py-2 text-sm font-medium text-danger outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Open emergencies: {emergencies}
          </Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
        <Reveal index={0}>
          <Card role="region" aria-label="Arrivals today">
            <CardHeader
              title="Arrivals today"
              description={
                total === undefined ? undefined : `${open.length} still to deal with`
              }
              action={
                total && total > 0 ? (
                  <SeeAll to={appPath('front-desk')}>{`See all ${total} at the front desk`}</SeeAll>
                ) : undefined
              }
            />

            {arrivals.isLoading ? (
              <PanelSkeleton label="Loading arrivals" />
            ) : arrivals.isError && !arrivals.data ? (
              <ErrorState
                title="Couldn’t load arrivals"
                description={failureText(arrivals.error)}
                action={
                  <Button size="sm" variant="secondary" onClick={() => void arrivals.refetch()}>
                    Try again
                  </Button>
                }
              />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={CalendarX2}
                title="No visits booked for today."
                description="Visits are booked from the appointments page."
              />
            ) : open.length === 0 ? (
              <EmptyState icon={CalendarX2} title="Nothing left to confirm today." />
            ) : (
              <ul className="divide-y divide-line">
                {open.slice(0, SHOWN).map((row) => (
                  <ArrivalRow
                    key={row.id}
                    appointment={row}
                    confirming={confirmingId === row.id}
                    onConfirm={(appointment, patientName) =>
                      confirm.mutate({ id: appointment.id, patientName })
                    }
                  />
                ))}
              </ul>
            )}
          </Card>
        </Reveal>

        <Reveal index={1}>
          <FreeBedsPanel />
        </Reveal>
      </div>
    </div>
  );
}

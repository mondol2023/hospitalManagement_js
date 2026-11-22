import { motion } from 'framer-motion';
import { CalendarX2 } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { ArrivalAppointment } from '@/features/appointments';
import { ApiError } from '@/shared/api/envelope';
import { cn } from '@/shared/lib/cn';
import { formatTime } from '@/shared/lib/format';
import { todayRange } from '@/shared/lib/hospital-day';
import { fade } from '@/shared/motion/variants';
import { APPOINTMENT_STATUS, refObject, type AppointmentStatus } from '@/shared/types/domain';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
} from '@/shared/ui';

import { useArrivals, useConfirmArrival } from '../model/use-front-desk';
import { useNow } from '../model/use-now';
import { ArrivalRow } from './ArrivalRow';
import { FreeBedsPanel } from './FreeBedsPanel';
import { MrnLookup } from './MrnLookup';

const STATUS_FILTERS: ReadonlyArray<{ value: AppointmentStatus; label: string }> = [
  { value: APPOINTMENT_STATUS.PENDING, label: 'Pending' },
  { value: APPOINTMENT_STATUS.CONFIRMED, label: 'Confirmed' },
  { value: APPOINTMENT_STATUS.COMPLETED, label: 'Completed' },
  { value: APPOINTMENT_STATUS.NO_SHOW, label: 'No-show' },
];

const dateLabel = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

function statusFromParam(value: string | null): AppointmentStatus | undefined {
  return STATUS_FILTERS.find((option) => option.value === value)?.value;
}

function pageFromParam(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/** A hairline with a ring node: where "now" falls between two visits. */
function NowMarker({ time }: { time: Date }) {
  return (
    <li
      role="separator"
      aria-label={`Now, ${formatTime(time)}`}
      className="flex items-center gap-2 px-4 py-1"
    >
      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-brand bg-surface" />
      <span aria-hidden="true" className="h-px flex-1 bg-brand/40" />
      <span aria-hidden="true" className="numeric text-xs font-medium text-brand">
        Now · {formatTime(time)}
      </span>
    </li>
  );
}

function ArrivalsSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading arrivals">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-line px-4 py-3 last:border-0">
          <Skeleton className="h-4 w-12" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * `/app/front-desk`: who is arriving, who is on file, and whether there is a bed.
 *
 * Everything that narrows the page lives in the URL (`?mrn=`, `?doctor=`,
 * `?status=`, `?page=`), so a refresh, a back button or a pasted link returns to
 * the same view. The arrivals refresh every minute; the "Now" marker moves with
 * the clock and "today" is re-read when the tab regains focus, so a desk left
 * open past midnight rolls over on its own.
 */
export function FrontDeskPage() {
  const [params, setParams] = useSearchParams();
  const now = useNow();
  const day = todayRange(now);

  const mrn = params.get('mrn') ?? '';
  const status = statusFromParam(params.get('status'));
  const doctor = params.get('doctor') ?? undefined;
  const page = pageFromParam(params.get('page'));
  const filtered = Boolean(status || doctor);

  const arrivals = useArrivals(day, { status, doctor, page });
  const confirm = useConfirmArrival();

  const rows = useMemo(() => arrivals.data?.items ?? [], [arrivals.data]);
  const pagination = arrivals.data?.pagination;

  // The doctor filter is built from the doctors seen on today's rows, so it
  // costs no extra request. They are remembered: once a filter narrows the list
  // to one doctor, the others must stay on offer or there is no way back.
  const [doctors, setDoctors] = useState<Record<string, string>>({});
  useEffect(() => {
    setDoctors((known) => {
      let next = known;
      for (const row of rows) {
        const person = refObject(row.doctor);
        if (person && known[person.id] !== person.name) {
          next = { ...next, [person.id]: person.name };
        }
      }
      return next;
    });
  }, [rows]);
  const doctorOptions = Object.entries(doctors).sort((a, b) => a[1].localeCompare(b[1]));

  function update(changes: Record<string, string | undefined>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: false }
    );
  }

  // Where the clock falls in the list: before the first visit that is still
  // ahead. At either end it is only drawn on the page that really holds that end.
  const markerAt = useMemo(() => {
    if (rows.length === 0) return -1;
    const ahead = rows.findIndex((row) => new Date(row.scheduledAt).getTime() > now.getTime());
    const index = ahead === -1 ? rows.length : ahead;
    if (index === 0 && page > 1) return -1;
    if (index === rows.length && pagination && page < pagination.totalPages) return -1;
    return index;
  }, [rows, now, page, pagination]);

  function onConfirm(appointment: ArrivalAppointment, patientName: string) {
    confirm.mutate({ id: appointment.id, patientName });
  }

  const confirmingId = confirm.isPending ? confirm.variables?.id : undefined;
  const total = pagination?.total;

  return (
    <motion.div variants={fade} initial="hidden" animate="visible">
      <PageHeader
        title="Front desk"
        description="Find a patient, confirm today’s visits, and see which beds are free."
        action={
          <p className="numeric text-sm text-muted" aria-label="Today">
            {dateLabel.format(now)}
          </p>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
        <div className="min-w-0 space-y-4">
          <MrnLookup submitted={mrn} onSubmit={(next) => update({ mrn: next })} />

          <Card role="region" aria-label="Arrivals today">
            <CardHeader
              title="Arrivals today"
              description={
                total === undefined
                  ? undefined
                  : `${total} ${total === 1 ? 'visit' : 'visits'}${filtered ? ' match' : ''}`
              }
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    inputSize="sm"
                    aria-label="Filter by doctor"
                    value={doctor ?? ''}
                    onChange={(event) => update({ doctor: event.target.value, page: undefined })}
                  >
                    <option value="">All doctors</option>
                    {doctor && !doctors[doctor] && <option value={doctor}>Selected doctor</option>}
                    {doctorOptions.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    inputSize="sm"
                    aria-label="Filter by status"
                    value={status ?? ''}
                    onChange={(event) => update({ status: event.target.value, page: undefined })}
                  >
                    <option value="">All statuses</option>
                    {STATUS_FILTERS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
              }
            />

            {arrivals.isLoading ? (
              <ArrivalsSkeleton />
            ) : arrivals.isError && !arrivals.data ? (
              <ErrorState
                title="Couldn’t load arrivals"
                description={
                  arrivals.error instanceof ApiError
                    ? arrivals.error.userMessage
                    : 'Check your connection and try again.'
                }
                action={
                  <Button size="sm" variant="secondary" onClick={() => void arrivals.refetch()}>
                    Try again
                  </Button>
                }
              />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={CalendarX2}
                title={filtered ? 'No visits match these filters.' : 'No visits booked for today.'}
                description={
                  filtered ? undefined : 'Visits are booked from the appointments page.'
                }
                action={
                  filtered ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => update({ doctor: undefined, status: undefined, page: undefined })}
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                {/* Filter changes swap the list instantly (spec §5.8): no transition on the dim. */}
                <ul className={cn('divide-y divide-line', arrivals.isPlaceholderData && 'opacity-60')}>
                  {rows.map((row, index) => (
                    <Fragment key={row.id}>
                      {markerAt === index && <NowMarker time={now} />}
                      <ArrivalRow
                        appointment={row}
                        onConfirm={onConfirm}
                        confirming={confirmingId === row.id}
                      />
                    </Fragment>
                  ))}
                  {markerAt === rows.length && <NowMarker time={now} />}
                </ul>
                {pagination && (
                  <Pagination
                    pagination={pagination}
                    unit="visit"
                    onPageChange={(next) => update({ page: next > 1 ? String(next) : undefined })}
                  />
                )}
              </>
            )}
          </Card>
        </div>

        <FreeBedsPanel />
      </div>
    </motion.div>
  );
}

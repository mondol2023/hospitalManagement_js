import { motion } from 'framer-motion';
import { CalendarCheck, CalendarX2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  AppointmentActions,
  useDoctorDaySchedule,
  type DayAgendaRow,
} from '@/features/appointments';
import { selectUser, useAuthStore } from '@/features/auth';
import { ApiError } from '@/shared/api/envelope';
import { cn } from '@/shared/lib/cn';
import { formatTime } from '@/shared/lib/format';
import { APPOINTMENT_TONE } from '@/shared/lib/status';
import { staggerRow } from '@/shared/motion/variants';
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge } from '@/shared/ui';

import { dayFromParam, partyOf, shiftDay, visitWindow } from '../model/display';

const dayLabel = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  // The day is a calendar date (`YYYY-MM-DD`, cut at UTC midnight by the
  // backend), so it is named in UTC too — not shifted into the viewer's zone.
  timeZone: 'UTC',
});

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * "My day": the signed-in doctor's visits for one date, in time order, drawn as
 * a route — a hairline with a ring for each stop and the single apricot node on
 * the visit that is under way or comes next.
 *
 * The date lives in the link (`?date=`), so a day can be bookmarked or sent to
 * a colleague, and the browser's back button steps through the days visited.
 * Finished visits are hidden until asked for: the page is for what is left to do.
 *
 * `onRecordConsultation` is how a completed visit is turned into a record. The
 * page only offers it when given somewhere to go.
 */
export function SchedulePage({
  onRecordConsultation,
}: {
  onRecordConsultation?: (visit: DayAgendaRow) => void;
}) {
  const user = useAuthStore(selectUser);
  const [params, setParams] = useSearchParams();
  const [showFinished, setShowFinished] = useState(false);
  const [completed, setCompleted] = useState<DayAgendaRow | null>(null);

  const today = utcToday();
  const day = dayFromParam(params.get('date'), today);

  const schedule = useDoctorDaySchedule(user?.id, day, { includeClosed: showFinished });
  const rows = schedule.data ?? [];

  // Rows slide in once, the first time the day arrives. Stepping between days
  // or ticking "Show finished" after that swaps content without a show.
  const settled = useRef(false);
  useEffect(() => {
    if (schedule.data) settled.current = true;
  }, [schedule.data]);

  const current = day === today ? visitWindow(rows, new Date()) : null;
  const inProgress = current
    ? rows.some(
        (row) => row.id === current && new Date(row.scheduledAt) <= new Date()
      )
    : false;

  function go(next: string) {
    setCompleted(null);
    setParams(next === today ? {} : { date: next });
  }

  function onCompleted(id: string) {
    const visit = rows.find((row) => row.id === id);
    if (visit && onRecordConsultation) setCompleted(visit);
  }

  return (
    <div>
      <PageHeader title="My day" description="Your visits for the day, in the order you’ll see them.">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1" role="group" aria-label="Choose a day">
            <Button
              size="sm"
              variant="secondary"
              aria-label="Previous day"
              onClick={() => go(shiftDay(day, -1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button size="sm" variant="secondary" disabled={day === today} onClick={() => go(today)}>
              Today
            </Button>
            <Button
              size="sm"
              variant="secondary"
              aria-label="Next day"
              onClick={() => go(shiftDay(day, 1))}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <h2 className="min-w-40 font-display text-base font-semibold" aria-live="polite">
            {dayLabel.format(new Date(`${day}T00:00:00Z`))}
          </h2>

          <label className="ml-auto flex h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showFinished}
              onChange={(event) => setShowFinished(event.target.checked)}
            />
            Show finished
          </label>
        </div>
      </PageHeader>

      {completed && (
        <div
          role="status"
          aria-label="Visit completed"
          className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-brand-soft px-4 py-3"
        >
          <p className="text-sm">
            Visit with <span className="font-medium">{partyOf(completed.patient).name}</span> is
            completed. Write it up while it’s fresh.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                onRecordConsultation?.(completed);
                setCompleted(null);
              }}
            >
              Record consultation
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCompleted(null)}>
              <X className="h-4 w-4" aria-hidden="true" />
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <Card role="region" aria-label="Visits">
        {schedule.isLoading ? (
          <div role="status" aria-busy="true" aria-label="Loading the day">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex items-center gap-4 border-b border-line px-4 py-4 last:border-0">
                <Skeleton className="h-4 w-14" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : schedule.isError ? (
          <ErrorState
            title="Couldn’t load your day"
            description={
              schedule.error instanceof ApiError
                ? schedule.error.userMessage
                : 'Check your connection, then try again.'
            }
            action={
              <Button size="sm" variant="secondary" onClick={() => void schedule.refetch()}>
                Try again
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={showFinished ? CalendarX2 : CalendarCheck}
            title={showFinished ? 'Nothing booked for this day.' : 'Nothing left on this day.'}
            description={
              showFinished
                ? 'Try another date, or ask reception to book a visit.'
                : 'Finished and cancelled visits are hidden. Turn on “Show finished” to see them.'
            }
          />
        ) : (
          <ol>
            {rows.map((row, index) => {
              const party = partyOf(row.patient);
              const here = row.id === current;
              return (
                <motion.li
                  key={row.id}
                  variants={staggerRow}
                  custom={index}
                  initial={settled.current ? false : 'hidden'}
                  animate="visible"
                  className="grid grid-cols-[3.75rem_1.25rem_minmax(0,1fr)] gap-x-3 px-4 sm:grid-cols-[4.5rem_1.25rem_minmax(0,1fr)_auto]"
                >
                  <div className="py-3.5 text-right">
                    <p className="numeric text-sm font-medium">{formatTime(row.scheduledAt)}</p>
                    <p className="text-xs text-muted">{row.durationMinutes} min</p>
                  </div>

                  {/* The route: a hairline between stops, a ring at each, apricot where the doctor is. */}
                  <div className="relative" aria-hidden="true">
                    <span
                      className={cn(
                        'absolute left-1/2 w-px -translate-x-1/2 bg-line',
                        index === 0 ? 'top-[1.4rem]' : 'top-0',
                        index === rows.length - 1 ? 'bottom-[calc(100%-1.4rem)]' : 'bottom-0'
                      )}
                    />
                    <span
                      className={cn(
                        'absolute left-1/2 top-[1.0625rem] h-3 w-3 -translate-x-1/2 rounded-full border-2',
                        here ? 'border-brand bg-warm' : 'border-brand/50 bg-surface'
                      )}
                    />
                  </div>

                  <div
                    className={cn(
                      'min-w-0 border-b border-line py-3',
                      index === rows.length - 1 && 'border-b-0'
                    )}
                  >
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="font-medium">{party.name}</span>
                      {party.mrn && <span className="font-mono text-xs text-muted">{party.mrn}</span>}
                      {here && (
                        <span className="rounded-full bg-warm px-2 py-0.5 text-xs font-medium text-warm-fg">
                          {inProgress ? 'Now' : 'Up next'}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">{row.reason || 'No reason given'}</p>
                    <div className="mt-2">
                      <StatusBadge status={row.status} tone={APPOINTMENT_TONE[row.status]} />
                    </div>
                  </div>

                  <div
                    className={cn(
                      'col-span-3 col-start-1 pb-3 sm:col-span-1 sm:col-start-4 sm:py-3',
                      index !== rows.length - 1 && 'border-b border-line sm:border-b'
                    )}
                  >
                    <AppointmentActions appointment={row} onCompleted={onCompleted} />
                  </div>
                </motion.li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}

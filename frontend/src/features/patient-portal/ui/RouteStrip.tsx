import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/shared/lib/cn';
import { formatDate, formatDateTime } from '@/shared/lib/format';
import { appPath } from '@/shared/lib/routes';
import { APPOINTMENT_TONE } from '@/shared/lib/status';
import { TRANSITION } from '@/shared/motion/variants';
import { refObject, type Bed } from '@/shared/types/domain';
import { Badge, buttonVariants, Card, Skeleton } from '@/shared/ui';

import { APPOINTMENT_STATUS_WORDS, doctorNameOf } from '../model/display';
import { useMyJourney, useMyPatient, useNextAppointments } from '../model/use-patient-portal';
import { CardError, TOUCH } from './parts';

/**
 * "Your route": where the patient has been, where they are, and where they go
 * next, on one line. It is the public site's wayfinding line, kept as a promise
 * after sign-in — "you always know where you are and where to go next".
 *
 * The three stops are an ordered list because they are a sequence. The drawing
 * is `aria-hidden`; the list carries the meaning.
 */

/** Seconds one stretch of the line takes to draw, and so the gap between stops. */
const DRAW = TRANSITION.draw.duration;

/**
 * Has the line drawn yet in this session? The drawing explains the route, which
 * is news the first time and noise the tenth, so it plays once and every later
 * visit to the dashboard shows the finished route. A module variable is the right
 * lifetime: it outlives the page, and a reload (a new session of use) resets it.
 */
let routeDrawn = false;

/** For tests: a fresh session. */
export function resetRouteDrawn() {
  routeDrawn = false;
}

/**
 * A stop's words arrive when the line reaches the stop. `custom` is the stop's
 * place on the route; the delay sits inside the variant because a variant's own
 * `transition` replaces the element's `transition` prop. Opacity only: the words
 * are already where they will stay.
 */
const arrive: Variants = {
  hidden: { opacity: 0 },
  visible: (stop: number) => ({
    opacity: 1,
    transition: { ...TRANSITION.enter, delay: stop * DRAW },
  }),
};

type Stop = 'last' | 'here' | 'next';

type Upcoming = ReturnType<typeof useNextAppointments>;
type Journey = ReturnType<typeof useMyJourney>;

export function RouteStrip() {
  // Each query is read once, here, and handed down. A second observer mounting on
  // a query that already failed would retry it (`retryOnMount`), which puts it
  // back to loading, which swaps the skeleton back in, which unmounts the observer.
  const upcoming = useNextAppointments();
  const journey = useMyJourney();

  return (
    // The one Apricot Wash panel on the page (DESIGN.md).
    <Card role="region" aria-label="Your care route" className="border-warm-soft bg-warm-soft">
      {upcoming.isLoading || journey.isLoading ? (
        <RouteSkeleton />
      ) : (
        <Route upcoming={upcoming} journey={journey} />
      )}
    </Card>
  );
}

/** Three rings on a sage line, in the shape of what is coming. */
function RouteSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading your care route"
      className="relative flex flex-col gap-8 p-4 sm:flex-row sm:gap-0 sm:p-6"
    >
      <span
        aria-hidden="true"
        className="absolute bottom-10 left-[27px] top-10 w-0.5 bg-brand/30 sm:bottom-auto sm:left-10 sm:right-10 sm:top-[35px] sm:h-0.5 sm:w-auto"
      />
      {[0, 1, 2].map((stop) => (
        <div key={stop} className="relative flex items-start gap-3 sm:flex-1 sm:flex-col">
          <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
          <div className="flex w-full flex-col gap-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Route({ upcoming, journey }: { upcoming: Upcoming; journey: Journey }) {
  const patient = useMyPatient();

  const reduced = useReducedMotion();
  const [draw] = useState(() => !routeDrawn && !reduced);
  useEffect(() => {
    routeDrawn = true;
  }, []);

  // A failed refetch keeps what was already on screen; the error only takes the
  // place of a stop that has nothing to show.
  const last = journey.data?.pages[0]?.items[0];
  const next = upcoming.data?.items[0];
  const more = Math.max((upcoming.data?.pagination.total ?? 0) - 1, 0);
  const pastFailed = journey.isError && !last;

  // With no visits behind them the line starts at "You are here".
  const stops: Stop[] = [...(last || pastFailed ? (['last'] as const) : []), 'here', 'next'];

  const admitted = patient.data?.isAdmitted && patient.data.ward ? patient.data : null;
  const bed = refObject<Bed>(admitted?.bed)?.bedNumber;

  const content: Record<Stop, ReactNode> = {
    last: pastFailed ? (
      <>
        <StopLabel>Last visit</StopLabel>
        <CardError
          title="Couldn't load your visits"
          error={journey.error}
          onRetry={() => void journey.refetch()}
          className="items-start px-0 py-1 text-left"
        />
      </>
    ) : last ? (
      <>
        <StopLabel>Last visit</StopLabel>
        <Link
          to={`${appPath('my-health')}#record-${last.id}`}
          className="inline-flex min-h-11 items-center font-display text-lg font-semibold hover:underline"
        >
          {formatDate(last.visitDate)}
        </Link>
        <p className="text-sm text-muted">{doctorNameOf(last.doctor)}</p>
      </>
    ) : null,

    here: (
      <>
        <span className="inline-block rounded-control bg-warm px-2 py-0.5 text-sm font-semibold text-warm-fg">
          You are here
        </span>
        <p className="mt-1 text-sm text-muted">Today</p>
        {admitted && (
          <p className="text-sm text-muted">{bed ? `Ward ${admitted.ward}, bed ${bed}` : `Ward ${admitted.ward}`}</p>
        )}
      </>
    ),

    next:
      upcoming.isError && !next ? (
        <>
          <StopLabel>Next visit</StopLabel>
          <CardError
            title="Couldn't load your appointments"
            error={upcoming.error}
            onRetry={() => void upcoming.refetch()}
            className="items-start px-0 py-1 text-left"
          />
        </>
      ) : next ? (
        <>
          <StopLabel>Next visit</StopLabel>
          <p className="font-display text-lg font-semibold">{formatDateTime(next.scheduledAt)}</p>
          <p className="text-sm font-medium">{doctorNameOf(next.doctor)}</p>
          {next.reason && <p className="text-sm text-muted">{next.reason}</p>}
          <div className="mt-2">
            <Badge tone={APPOINTMENT_TONE[next.status]}>
              {APPOINTMENT_STATUS_WORDS[next.status] ?? next.status}
            </Badge>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link
              to={appPath('appointments')}
              className={cn(buttonVariants({ variant: 'secondary' }), TOUCH)}
            >
              View appointments
            </Link>
            {more > 0 && <span className="text-sm text-muted">+{more} more booked</span>}
          </div>
        </>
      ) : (
        <>
          <StopLabel>Next visit</StopLabel>
          <p className="font-display text-lg font-semibold">Nothing booked yet</p>
          <Link
            to={appPath('appointments')}
            className={cn(buttonVariants({ size: 'lg' }), 'mt-3')}
          >
            Book an appointment
          </Link>
        </>
      ),
  };

  return (
    <ol
      data-motion={draw ? 'draw' : 'still'}
      className="flex flex-col p-4 sm:grid sm:grid-flow-col sm:auto-cols-fr sm:p-6"
    >
      {stops.map((stop, index) => {
        const isLast = index === stops.length - 1;
        return (
          <li
            key={stop}
            className={cn(
              'relative pl-9 sm:pl-0 sm:pr-4 sm:pt-9',
              !isLast && 'pb-8 sm:pb-0'
            )}
          >
            {!isLast && <Segment index={index} dashed={stop === 'here'} draw={draw} />}
            <Node stop={stop} booked={Boolean(next)} />
            <motion.div
              variants={arrive}
              custom={index}
              initial={draw ? 'hidden' : false}
              animate="visible"
            >
              {content[stop]}
            </motion.div>
          </li>
        );
      })}
    </ol>
  );
}

function StopLabel({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

/** A 24px box so every stop's centre sits at (12, 12) and the line can aim at it. */
function Node({ stop, booked }: { stop: Stop; booked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center"
    >
      {stop === 'here' ? (
        <span className="h-[18px] w-[18px] rounded-full bg-warm" />
      ) : (
        <span
          className={cn(
            'h-3.5 w-3.5 rounded-full border-2 border-brand bg-warm-soft',
            stop === 'next' && !booked && 'border-dashed'
          )}
        />
      )}
    </span>
  );
}

/**
 * The stretch of line from one node to the next. Solid is behind the patient;
 * dashed is still to come. It runs down on a phone and across from `sm`, so each
 * orientation is its own drawing and CSS shows one of them.
 */
function Segment({ index, dashed, draw }: { index: number; dashed: boolean; draw: boolean }) {
  return (
    <>
      <Stretch
        vertical
        index={index}
        dashed={dashed}
        draw={draw}
        className="absolute left-[11px] top-3 h-full w-0.5 sm:hidden"
      />
      <Stretch
        index={index}
        dashed={dashed}
        draw={draw}
        className="absolute left-3 top-[11px] hidden h-0.5 w-full sm:block"
      />
    </>
  );
}

function Stretch({
  vertical = false,
  index,
  dashed,
  draw,
  className,
}: {
  vertical?: boolean;
  index: number;
  dashed: boolean;
  draw: boolean;
  className: string;
}) {
  const mask = useId();

  // Percentages keep the line true at any width without a viewBox to distort it.
  const along = vertical
    ? { x1: 1, x2: 1, y1: 0, y2: '100%' }
    : { x1: 0, x2: '100%', y1: 1, y2: 1 };

  // `pathLength` 0 → 1 reveals the line from the node it leaves. Under reduced
  // motion, or after the first time, it starts complete.
  const reveal = {
    initial: draw ? { pathLength: 0 } : false,
    animate: { pathLength: 1 },
    transition: { ...TRANSITION.draw, delay: index * DRAW },
  } as const;

  return (
    <svg aria-hidden="true" focusable="false" className={cn('text-brand', className)}>
      {dashed ? (
        <>
          {/*
            Framer owns `stroke-dasharray` while it draws a path, so a dashed line
            cannot also be the line that draws. The dashes are static; a solid
            line draws a mask over them.
          */}
          <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
            <motion.line {...along} stroke="white" strokeWidth={2} {...reveal} />
          </mask>
          <line
            {...along}
            stroke="currentColor"
            strokeWidth={2}
            strokeDasharray="4 4"
            mask={`url(#${mask})`}
          />
        </>
      ) : (
        <motion.line {...along} stroke="currentColor" strokeWidth={2} {...reveal} />
      )}
    </svg>
  );
}

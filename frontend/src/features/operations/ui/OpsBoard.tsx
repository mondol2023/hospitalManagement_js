import { motion } from 'framer-motion';
import { BedDouble } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  ANALYTICS_PERIODS,
  useDashboard,
  useLiveBoard,
  useWardOccupancy,
  type AnalyticsPeriod,
} from '@/features/dashboard';
import { ApiError } from '@/shared/api/envelope';
import { cn } from '@/shared/lib/cn';
import { formatTime, humanizeEnum, pluralize } from '@/shared/lib/format';
import { appPath } from '@/shared/lib/routes';
import { TRANSITION } from '@/shared/motion/variants';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Select,
  Skeleton,
} from '@/shared/ui';

import { failureText } from '../model/failure-text';
import { claimFirstDraw } from '../model/ward-draw';
import { PanelSkeleton, Reveal } from './DashboardParts';
import { MetricGrid } from './MetricGrid';
import { OccupancyTrack } from './OccupancyTrack';
import { Signpost } from './Signpost';

/**
 * How old the board is allowed to be before it says so.
 *
 * The rollup runs on a schedule; a few minutes behind is normal and saying so
 * on every load would train people to ignore the line. Half an hour behind is
 * a cron that stopped.
 */
const STALE_AFTER_MINUTES = 30;

function StaleNote({ minutes }: { minutes: number | null }) {
  if (minutes == null || minutes < STALE_AFTER_MINUTES) return null;
  return (
    <p role="status" className="text-sm text-warning">
      These figures were last rolled up {Math.round(minutes)} minutes ago and may be behind.
    </p>
  );
}

/** The reporting limiter's answer. Not a failure: the last figures are still good. */
function isThrottled(error: unknown): boolean {
  return error instanceof ApiError && error.status === 429;
}

function TryAgain({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="secondary" onClick={onClick}>
      Try again
    </Button>
  );
}

/**
 * The admin and manager landing board: "is anything on fire right now?"
 *
 * The order is the priority. What someone acts on comes first (the live strip),
 * then where there is room (the ward tracks), then the rolled-up figures that
 * explain the day. Today's board led with the tiles, which are the slowest
 * numbers on it.
 *
 * Polling is unchanged: live and occupancy every 30 s, tiles every 120 s, so the
 * board makes the requests it always did. Each panel loads, fails and retries on
 * its own; a failing rollup never hides the emergencies.
 */
export function OpsBoard({ name }: { name?: string }) {
  const [period, setPeriod] = useState<AnalyticsPeriod>('daily');
  // Decided once per visit: the ward tracks draw on the first visit of a session
  // and are complete on every later one (spec §5.8).
  const [drawWards] = useState(claimFirstDraw);

  const dashboard = useDashboard(period);
  const live = useLiveBoard();
  const occupancy = useWardOccupancy();

  const snapshot = dashboard.data;
  const board = live.data;
  const wards = occupancy.data;

  const throttled = [live, occupancy, dashboard].some(
    (query) => query.isError && query.data !== undefined && isThrottled(query.error)
  );

  // Only emergencies get a sign here. An "entries need attention" sign would
  // point at the ward feed, which is nurse-only, so for an admin it would lead
  // to a redirect.
  const emergencies = board?.openEmergencies ?? 0;
  const sign = emergencies > 0 && {
    to: appPath('emergencies'),
    text: pluralize(emergencies, 'open emergency', 'open emergencies'),
  };

  return (
    <div>
      <PageHeader
        title={name ? `Good to see you, ${name.split(' ')[0]}` : 'Dashboard'}
        description="Is anything on fire right now?"
        action={
          <Field label="Period" className="w-40">
            <Select
              inputSize="sm"
              value={period}
              onChange={(event) => setPeriod(event.target.value as AnalyticsPeriod)}
            >
              {ANALYTICS_PERIODS.map((value) => (
                <option key={value} value={value}>
                  {humanizeEnum(value)}
                </option>
              ))}
            </Select>
          </Field>
        }
      />

      {throttled && (
        <p role="status" className="mb-3 text-sm text-warning">
          Figures paused for a minute to ease the load. They’ll refresh on their own.
        </p>
      )}

      <div className="mb-4">
        <Signpost options={[sign]} />
      </div>

      <div className="space-y-4">
        <Reveal index={0}>
          <Card role="region" aria-label="Live now">
            {live.isLoading ? (
              <div
                role="status"
                aria-busy="true"
                aria-label="Loading live figures"
                className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3"
              >
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-12" />
                ))}
              </div>
            ) : live.isError && !board ? (
              <ErrorState
                title="Couldn’t load the live figures"
                description={failureText(live.error)}
                action={<TryAgain onClick={() => void live.refetch()} />}
              />
            ) : board ? (
              <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <LiveCell
                  label="Emergencies"
                  value={board.openEmergencies}
                  word="open"
                  zeroText="None open"
                  tone="danger"
                  to={appPath('emergencies')}
                />
                {/* Not a link: the attention queue lives on the nurse-only ward feed. */}
                <LiveCell
                  label="Needs attention"
                  value={board.unacknowledgedAlerts}
                  word="waiting"
                  zeroText="None waiting"
                  tone="warning"
                />
                <LiveCell
                  label="Low stock"
                  value={board.lowStockCount}
                  word="low"
                  zeroText="None low"
                  tone="warning"
                  to={appPath('pharmacy')}
                />
              </div>
            ) : null}
          </Card>
        </Reveal>

        <Reveal index={1}>
          <Card role="region" aria-label="Wards">
            <CardHeader
              title="Wards"
              action={
                wards ? (
                  <span className="text-xs tabular-nums text-muted">
                    Updated {formatTime(wards.generatedAt)}
                  </span>
                ) : undefined
              }
            />

            {occupancy.isLoading ? (
              <PanelSkeleton label="Loading ward occupancy" />
            ) : occupancy.isError && !wards ? (
              <ErrorState
                title="Couldn’t load ward occupancy"
                description={failureText(occupancy.error)}
                action={<TryAgain onClick={() => void occupancy.refetch()} />}
              />
            ) : !wards || wards.wards.length === 0 ? (
              <EmptyState
                icon={BedDouble}
                title="No wards configured"
                description="Beds added to the system will appear here grouped by ward."
              />
            ) : (
              <ul className="divide-y divide-line px-4">
                {wards.wards.map((ward) => (
                  <OccupancyTrack key={ward.ward} ward={ward} draw={drawWards} />
                ))}
              </ul>
            )}
          </Card>
        </Reveal>

        <Reveal index={2}>
          <section aria-label="Rolled-up figures" className="space-y-3">
            <h2 className="font-display text-sm font-semibold">
              Rolled-up figures ({snapshot?.period ?? period})
            </h2>

            {dashboard.isLoading ? (
              <div
                role="status"
                aria-busy="true"
                aria-label="Loading rolled-up figures"
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
              >
                {Array.from({ length: 8 }, (_, index) => (
                  <Skeleton key={index} className="h-24 rounded-card" />
                ))}
              </div>
            ) : dashboard.isError && !snapshot ? (
              <Card>
                <ErrorState
                  title="Couldn’t load the rolled-up figures"
                  description={failureText(dashboard.error)}
                  action={<TryAgain onClick={() => void dashboard.refetch()} />}
                />
              </Card>
            ) : (
              // Old figures stay up while the new period loads, dimmed so nobody
              // reads them as the new period's. Opacity only, no count-up: a
              // figure is never mid-tween while someone is reading it.
              <div
                className={cn(
                  'space-y-4 transition-opacity duration-100',
                  dashboard.isPlaceholderData && 'opacity-60'
                )}
              >
                <MetricGrid tiles={snapshot?.tiles ?? []} />
                <StaleNote minutes={snapshot?.stalestMinutes ?? null} />
              </div>
            )}
          </section>
        </Reveal>
      </div>
    </div>
  );
}

const CELL_TONE = {
  danger: 'text-danger',
  warning: 'text-warning',
} as const;

/**
 * One cell of the live strip.
 *
 * A count above zero takes its tone and a word ("2 open"); zero is muted and
 * says so ("None open"); `null` is a dash, because the analytics API's rule is
 * that a number it does not have is not zero. When the number changes under
 * someone's eye it cross-fades, which marks a change the data caused without a
 * count-up.
 */
function LiveCell({
  label,
  value,
  word,
  zeroText,
  tone,
  to,
}: {
  label: string;
  value: number | null;
  word: string;
  zeroText: string;
  tone: keyof typeof CELL_TONE;
  to?: string;
}) {
  const text = value == null ? '—' : value === 0 ? zeroText : `${value.toLocaleString()} ${word}`;
  const active = value != null && value > 0;

  // The first paint is the panel's own entrance; only later changes cross-fade.
  const settled = useRef(false);
  useEffect(() => {
    settled.current = true;
  }, []);

  const content = (
    <>
      <span className="label-eyebrow">{label}</span>{' '}
      <motion.span
        key={text}
        initial={settled.current ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={TRANSITION.number}
        className={cn(
          'mt-1 block text-2xl font-medium leading-tight tabular-nums',
          active ? CELL_TONE[tone] : 'text-muted'
        )}
      >
        {text}
      </motion.span>
    </>
  );

  const frame = cn(
    'block px-4 py-3',
    active && tone === 'danger' && 'bg-danger-soft'
  );

  return to ? (
    <Link
      to={to}
      className={cn(
        frame,
        'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand [@media(hover:hover)]:hover:bg-surface-raised'
      )}
    >
      {content}
    </Link>
  ) : (
    <div className={frame}>{content}</div>
  );
}

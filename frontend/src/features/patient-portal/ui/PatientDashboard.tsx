import { AnimatePresence, motion } from 'framer-motion';
import { Activity, HeartPulse, Receipt, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { formatDate, initials, pluralize } from '@/shared/lib/format';
import { formatMoney } from '@/shared/lib/money';
import { appPath } from '@/shared/lib/routes';
import { collapsible, fade, staggerRow } from '@/shared/motion/variants';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Skeleton,
} from '@/shared/ui';

import {
  doctorNameOf,
  greetingLine,
  openBalance,
  readingsOf,
  salutation,
} from '../model/display';
import {
  useMyCareTeam,
  useMyLatestVitals,
  useMyOpenBills,
  useMyPatient,
  useNextAppointments,
  useOpenCareTeamChat,
} from '../model/use-patient-portal';
import { CardError, TOUCH } from './parts';
import { RouteStrip } from './RouteStrip';

/** Nurses named on the card; the rest are counted, not listed. */
const NURSES_SHOWN = 3;

/**
 * A patient's first screen: where they are on their route, how they are doing, who is
 * looking after them, and whether they owe anything. Plain words and few items.
 *
 * Every card loads and fails on its own, so one failed query never blanks the
 * page. Nothing here is coloured by meaning: no traffic-light vitals, no red
 * balance — a patient reading their own numbers is not the audience for an alarm.
 */
export function PatientDashboard({ name }: { name?: string }) {
  const now = new Date();
  const first = name?.split(' ')[0];

  const patient = useMyPatient();
  const upcoming = useNextAppointments();

  const line = greetingLine({
    patient: patient.data,
    next: upcoming.data?.items[0],
    now,
  });

  return (
    <div>
      <PageHeader
        title={first ? `${salutation(now)}, ${first}` : salutation(now)}
        description={line ?? undefined}
      />

      <Arrive order={0}>
        <RouteStrip />
      </Arrive>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Arrive order={1}>
          <LatestVitalsCard />
        </Arrive>
        <Arrive order={2}>
          <CareTeamCard patientId={patient.data?.id} patientFailed={patient.isError} />
        </Arrive>
        <Arrive order={3}>
          <BillsCard />
        </Arrive>
      </div>

      <Arrive order={4}>
        <EmergencyNotice />
      </Arrive>
    </div>
  );
}

/**
 * A card's entrance. `order` follows reading order on a wide screen (left to
 * right, then down), so the eye and the stagger travel together. It plays once,
 * on mount; a background refetch never replays it.
 */
function Arrive({ order, children }: { order: number; children: ReactNode }) {
  return (
    <motion.div variants={staggerRow} custom={order} initial="hidden" animate="visible">
      {children}
    </motion.div>
  );
}

/**
 * Wraps what replaces a card's skeleton (content, empty or error) so the swap
 * cross-fades instead of snapping. Opacity only: the card is already in place,
 * and moving text the patient has started to read would be worse than a jump.
 */
function Settled({ children }: { children: ReactNode }) {
  return (
    <motion.div variants={fade} initial="hidden" animate="visible">
      {children}
    </motion.div>
  );
}

function CardSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-2 p-4">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-2/5" />
    </div>
  );
}

/** A navigation, so a real link in the button's look — never a button inside a link. */
function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-sm font-medium text-brand hover:underline">
      {children}
    </Link>
  );
}

function LatestVitalsCard() {
  const latest = useMyLatestVitals();
  const record = latest.data;
  const readings = readingsOf(record?.vitals);

  return (
    <Card role="region" aria-label="Latest vitals">
      <CardHeader
        title="Latest vitals"
        action={<CardLink to={appPath('my-health')}>See your care journey</CardLink>}
      />

      {latest.isLoading ? (
        <CardSkeleton label="Loading your vitals" />
      ) : (
        <Settled>
          {latest.isError ? (
            <CardError
              title="Couldn't load your vitals"
              error={latest.error}
              onRetry={() => void latest.refetch()}
            />
          ) : !record || readings.length === 0 ? (
            <EmptyState
              icon={HeartPulse}
              title="No vitals recorded yet. They'll appear here after your next visit."
              className="py-8"
            />
          ) : (
            <CardBody className="flex flex-col gap-3">
              <p className="text-sm text-muted">
                {formatDate(record.visitDate)} · {doctorNameOf(record.doctor)}
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                {readings.map((reading) => (
                  <div key={reading.label}>
                    <dt className="text-xs text-muted">{reading.label}</dt>
                    <dd className="flex items-baseline gap-1">
                      <span className="numeric text-lg font-medium">{reading.value}</span>
                      <span className="text-xs text-muted">{reading.unit}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          )}
        </Settled>
      )}
    </Card>
  );
}

function Person({ name, detail, pic }: { name: string; detail?: string; pic?: string }) {
  return (
    <li className="flex items-center gap-3">
      {pic ? (
        <img src={pic} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand"
        >
          {initials(name)}
        </span>
      )}
      <span className="min-w-0 text-sm">
        <span className="block truncate font-medium">{name}</span>
        {detail && <span className="block truncate text-xs text-muted">{detail}</span>}
      </span>
    </li>
  );
}

function CareTeamCard({
  patientId,
  patientFailed,
}: {
  patientId: string | undefined;
  patientFailed: boolean;
}) {
  const team = useMyCareTeam();
  const open = useOpenCareTeamChat();
  const navigate = useNavigate();

  const doctor = team.data?.primaryDoctor ?? null;
  const nurses = team.data?.nurses ?? [];
  const shownNurses = nurses.slice(0, NURSES_SHOWN);
  const hiddenNurses = nurses.length - shownNurses.length;
  const hasTeam = doctor !== null || nurses.length > 0;

  function message() {
    if (!patientId) return;
    open.mutate(patientId, {
      onSuccess: (conversation) => {
        navigate(`${appPath('messages')}?c=${conversation.id}`);
      },
    });
  }

  return (
    <Card role="region" aria-label="My care team">
      <CardHeader title="My care team" />

      {team.isLoading ? (
        <CardSkeleton label="Loading your care team" />
      ) : (
        <Settled>
          {team.isError ? (
            <CardError
              title="Couldn't load your care team"
              error={team.error}
              onRetry={() => void team.refetch()}
            />
          ) : !hasTeam ? (
            <EmptyState
              icon={Users}
              title="Your care team hasn't been assigned yet."
              className="py-8"
            />
          ) : (
            <CardBody className="flex flex-col gap-4">
              <ul className="flex flex-col gap-3">
                {doctor && (
                  <Person
                    name={doctor.name}
                    pic={doctor.profilePic}
                    detail={
                      [doctor.specialization, doctor.department].filter(Boolean).join(' · ') ||
                      'Your doctor'
                    }
                  />
                )}
                {shownNurses.map((nurse) => (
                  <Person key={nurse.id} name={nurse.name} pic={nurse.profilePic} detail="Nurse" />
                ))}
              </ul>
              {hiddenNurses > 0 && <p className="text-sm text-muted">+{hiddenNurses} more</p>}

              {patientFailed ? (
                <p className="text-sm text-muted">
                  We couldn't find your patient record. Please contact the front desk.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button
                    className={TOUCH}
                    loading={open.isPending}
                    disabled={!patientId || open.isPending}
                    onClick={message}
                  >
                    Message my care team
                  </Button>
                  {/* Grows open rather than popping in, so the button above doesn't jump. */}
                  <AnimatePresence initial={false}>
                    {open.noCareTeam && (
                      <motion.p
                        key="no-care-team"
                        role="status"
                        variants={collapsible}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        className="overflow-hidden text-sm text-muted"
                      >
                        Your care team hasn't been assigned yet. The ward will add them when your
                        care starts.
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </CardBody>
          )}
        </Settled>
      )}
    </Card>
  );
}

function BillsCard() {
  const bills = useMyOpenBills();
  const items = bills.data?.items ?? [];
  const count = bills.data?.pagination.total ?? 0;
  const balance = openBalance(items);

  return (
    <Card role="region" aria-label="Bills">
      <CardHeader
        title="Bills"
        action={<CardLink to={appPath('billing')}>See your bills</CardLink>}
      />

      {bills.isLoading ? (
        <CardSkeleton label="Loading your bills" />
      ) : (
        <Settled>
          {bills.isError ? (
            <CardError
              title="Couldn't load your bills"
              error={bills.error}
              onRetry={() => void bills.refetch()}
            />
          ) : count === 0 ? (
            <EmptyState icon={Receipt} title="You're all paid up." className="py-8" />
          ) : (
            <CardBody className="flex flex-col gap-1">
              <span className="text-xs text-muted">You still owe</span>
              <span className="numeric text-2xl font-medium">
                {formatMoney(balance.cents, balance.currency)}
              </span>
              <span className="text-sm text-muted">across {pluralize(count, 'open bill')}</span>
            </CardBody>
          )}
        </Settled>
      )}
    </Card>
  );
}

function EmergencyNotice() {
  return (
    <Card className="mt-4">
      <CardHeader title="In an emergency" />
      <CardBody className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
          <Activity className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="text-sm text-muted">
          Do not use this app to report an emergency. Call your local emergency number, or go to the
          nearest emergency department.
        </p>
      </CardBody>
    </Card>
  );
}

import { motion } from 'framer-motion';
import { Activity, CalendarDays, MessageSquare, Receipt } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { selectRole, selectUser, useAuthStore } from '@/features/auth';
import { ApiError } from '@/shared/api/envelope';
import { humanizeEnum } from '@/shared/lib/format';
import { isStaff } from '@/shared/lib/roles';
import { fadeSlideUp } from '@/shared/motion/variants';
import {
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  Field,
  Metric,
  PageHeader,
  Select,
  Skeleton,
} from '@/shared/ui';

import { ANALYTICS_PERIODS, type AnalyticsPeriod } from '../api/analytics-api';
import { useDashboard, useLiveBoard, useWardOccupancy } from '../model/use-analytics';
import { MetricGrid } from './MetricGrid';
import { OccupancyPanel } from './OccupancyPanel';

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

/**
 * The signed-in landing page.
 *
 * Two entirely different screens live here, because `/` is the one route every
 * role can open. Staff get the analytics board; a patient gets a way in to
 * their own records — every `/analytics/*` endpoint is `requireStaff`, so
 * rendering the board for a patient would be a guaranteed 403 on first paint.
 * The gate below is UX; the backend is still the boundary.
 */
export function DashboardPage() {
  const role = useAuthStore(selectRole);
  const user = useAuthStore(selectUser);

  if (!isStaff(role)) return <PatientHome name={user?.name} />;

  return <StaffDashboard name={user?.name} />;
}

function StaffDashboard({ name }: { name?: string }) {
  const [period, setPeriod] = useState<AnalyticsPeriod>('daily');

  const dashboard = useDashboard(period);
  const live = useLiveBoard();
  const occupancy = useWardOccupancy();

  const snapshot = dashboard.data;

  return (
    <div>
      <PageHeader
        title={name ? `Good to see you, ${name.split(' ')[0]}` : 'Dashboard'}
        description="Hospital-wide figures, rolled up on a schedule."
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

      {/* The live strip. Separate query, faster refetch — these are the three
          numbers a nurse station reads as current. */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <LiveTile
          label="Open emergencies"
          value={live.data?.openEmergencies}
          loading={live.isLoading}
          tone="danger"
        />
        <LiveTile
          label="Unacknowledged alerts"
          value={live.data?.unacknowledgedAlerts}
          loading={live.isLoading}
          tone="warning"
        />
        <LiveTile
          label="Medicines low on stock"
          value={live.data?.lowStockCount}
          loading={live.isLoading}
          tone="warning"
        />
      </div>

      {dashboard.isError ? (
        <Card>
          <CardBody>
            <ErrorState
              title="The board could not be loaded"
              description={
                dashboard.error instanceof ApiError
                  ? dashboard.error.userMessage
                  : 'Reporting is unavailable right now.'
              }
            />
          </CardBody>
        </Card>
      ) : dashboard.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-card" />
          ))}
        </div>
      ) : (
        <motion.div variants={fadeSlideUp} initial="hidden" animate="visible" className="space-y-4">
          <MetricGrid tiles={snapshot?.tiles ?? []} />
          <StaleNote minutes={snapshot?.stalestMinutes ?? null} />
        </motion.div>
      )}

      <OccupancyPanel
        className="mt-4"
        wards={occupancy.data?.wards}
        loading={occupancy.isLoading}
      />
    </div>
  );
}

function LiveTile({
  label,
  value,
  loading,
  tone,
}: {
  label: string;
  value: number | undefined;
  loading?: boolean;
  tone: 'warning' | 'danger';
}) {
  return (
    <Card>
      <CardBody>
        {loading ? (
          <Skeleton className="h-10" />
        ) : (
          <Metric
            label={label}
            value={value == null ? '—' : value.toLocaleString()}
            tone={value ? tone : 'default'}
          />
        )}
      </CardBody>
    </Card>
  );
}

/** Where a patient lands. No analytics, just the four things they came for. */
const PATIENT_LINKS = [
  {
    to: '/appointments',
    icon: CalendarDays,
    title: 'Appointments',
    description: 'Book a visit, or check when your next one is.',
  },
  {
    to: '/billing',
    icon: Receipt,
    title: 'Bills',
    description: 'Statements, payments and anything outstanding.',
  },
  {
    to: '/messages',
    icon: MessageSquare,
    title: 'Messages',
    description: 'Talk to your care team.',
  },
] as const;

function PatientHome({ name }: { name?: string }) {
  return (
    <div>
      <PageHeader
        title={name ? `Welcome, ${name.split(' ')[0]}` : 'Welcome'}
        description="Your appointments, bills and messages in one place."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PATIENT_LINKS.map(({ to, icon: Icon, title, description }) => (
          <Link
            key={to}
            to={to}
            className="rounded-card border border-line bg-surface p-4 transition-colors hover:border-brand hover:bg-surface-raised"
          >
            <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-control bg-brand-soft text-brand">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="font-display text-sm font-semibold">{title}</p>
            <p className="mt-1 text-sm text-muted">{description}</p>
          </Link>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader title="In an emergency" />
        <CardBody className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="text-sm text-muted">
            Do not use this app to report an emergency. Call your local emergency number, or go to
            the nearest emergency department.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

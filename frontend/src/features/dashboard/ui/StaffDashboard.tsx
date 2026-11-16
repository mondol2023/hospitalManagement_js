import { motion } from 'framer-motion';
import { useState } from 'react';

import { ApiError } from '@/shared/api/envelope';
import { humanizeEnum } from '@/shared/lib/format';
import { fadeSlideUp } from '@/shared/motion/variants';
import {
  Card,
  CardBody,
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

/** The hospital-wide analytics board. Every staff role without its own view lands here. */
export function StaffDashboard({ name }: { name?: string }) {
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

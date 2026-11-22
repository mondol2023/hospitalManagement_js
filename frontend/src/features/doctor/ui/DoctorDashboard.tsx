import { CalendarCheck, FileText, UserCheck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useDoctorDaySchedule } from '@/features/appointments';
import { selectUser, useAuthStore } from '@/features/auth';
import { ApiError } from '@/shared/api/envelope';
import { formatDate, formatTime } from '@/shared/lib/format';
import { appPath } from '@/shared/lib/routes';
import { APPOINTMENT_TONE } from '@/shared/lib/status';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  StatusBadge,
} from '@/shared/ui';

import { partyOf } from '../model/display';
import { useFollowUps, useMyAuthoredRecords } from '../model/use-doctor';
import { RecordDrawer } from './RecordDrawer';

const SHOWN = 5;

/**
 * The first screen of a doctor's day, as three panels that load and fail on
 * their own: what is left to see today, who is due back, and what was written
 * up last. A slow follow-up query never holds the day's visits behind a skeleton.
 *
 * A row in either of the lists opens the record beside the dashboard.
 */
export function DoctorDashboard({ name }: { name?: string }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title={name ? `Good to see you, ${name.split(' ')[0]}` : 'Dashboard'}
        description="Today’s visits, who’s due back, and what you wrote last."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <TodayPanel />
        <div className="flex flex-col gap-4">
          <FollowUpsPanel onOpen={setOpenId} />
          <RecentRecordsPanel onOpen={setOpenId} />
        </div>
      </div>

      <RecordDrawer recordId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function failureText(error: unknown): string {
  return error instanceof ApiError ? error.userMessage : 'Check your connection, then try again.';
}

function PanelSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-0">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function SeeAll({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-sm font-medium text-brand hover:underline">
      {children}
    </Link>
  );
}

/** A row that opens a record: the whole line is the button. */
function OpenRow({
  onOpen,
  children,
}: {
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-raised"
      >
        {children}
      </button>
    </li>
  );
}

function TodayPanel() {
  const user = useAuthStore(selectUser);
  const today = new Date().toISOString().slice(0, 10);
  const schedule = useDoctorDaySchedule(user?.id, today);
  const rows = schedule.data ?? [];

  return (
    <Card role="region" aria-label="Today’s visits">
      <CardHeader
        title="Today’s visits"
        description={rows.length > 0 ? `${rows.length} still to see` : undefined}
        action={<SeeAll to={appPath('schedule')}>My day</SeeAll>}
      />

      {schedule.isLoading ? (
        <PanelSkeleton label="Loading today’s visits" />
      ) : schedule.isError ? (
        <ErrorState
          title="Couldn’t load today’s visits"
          description={failureText(schedule.error)}
          action={
            <Button size="sm" variant="secondary" onClick={() => void schedule.refetch()}>
              Try again
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="Nothing left today."
          description="Finished visits are in My day, under “Show finished”."
        />
      ) : (
        <ul className="divide-y divide-line">
          {rows.slice(0, SHOWN).map((row) => {
            const party = partyOf(row.patient);
            return (
              <li key={row.id} className="flex items-center gap-4 px-4 py-3">
                <span className="numeric w-14 shrink-0 text-sm font-medium">
                  {formatTime(row.scheduledAt)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{party.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {row.reason || 'No reason given'}
                  </span>
                </span>
                <StatusBadge status={row.status} tone={APPOINTMENT_TONE[row.status]} />
              </li>
            );
          })}
          {rows.length > SHOWN && (
            <li className="px-4 py-3 text-sm text-muted">
              and {rows.length - SHOWN} more in <SeeAll to={appPath('schedule')}>My day</SeeAll>
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}

function FollowUpsPanel({ onOpen }: { onOpen: (recordId: string) => void }) {
  const overdue = useFollowUps({ overdue: true, limit: SHOWN });
  const upcoming = useFollowUps({ days: 7, limit: SHOWN });

  const loading = overdue.isLoading || upcoming.isLoading;
  const failed = overdue.isError || upcoming.isError;

  const late = overdue.data?.items ?? [];
  const soon = upcoming.data?.items ?? [];
  const items = [
    ...late.map((row) => ({ row, isOverdue: true })),
    ...soon.map((row) => ({ row, isOverdue: false })),
  ].slice(0, SHOWN);

  const lateTotal = overdue.data?.pagination.total ?? 0;
  const soonTotal = upcoming.data?.pagination.total ?? 0;

  return (
    <Card role="region" aria-label="Follow-ups">
      <CardHeader
        title="Follow-ups"
        description={
          loading || failed
            ? undefined
            : lateTotal + soonTotal > 0
              ? `${lateTotal} overdue, ${soonTotal} in the next 7 days`
              : undefined
        }
        action={<SeeAll to={appPath('follow-ups')}>See all</SeeAll>}
      />

      {loading ? (
        <PanelSkeleton label="Loading follow-ups" />
      ) : failed ? (
        <ErrorState
          title="Couldn’t load follow-ups"
          description={failureText(overdue.error ?? upcoming.error)}
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (overdue.isError) void overdue.refetch();
                if (upcoming.isError) void upcoming.refetch();
              }}
            >
              Try again
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title="No follow-ups due this week."
          description="Patients you’ve asked to see again appear here as their date nears."
        />
      ) : (
        <ul className="divide-y divide-line">
          {items.map(({ row, isOverdue }) => (
            <OpenRow key={row.id} onOpen={() => onOpen(row.id)}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {partyOf(row.patient).name}
                </span>
                <span className="block truncate text-xs text-muted">{row.diagnosis}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {isOverdue && <Badge tone="warning">Overdue</Badge>}
                <span className="text-xs text-muted">Due {formatDate(row.followUpDate)}</span>
              </span>
            </OpenRow>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentRecordsPanel({ onOpen }: { onOpen: (recordId: string) => void }) {
  const records = useMyAuthoredRecords({ limit: SHOWN });
  const rows = records.data?.items ?? [];

  return (
    <Card role="region" aria-label="Recent records">
      <CardHeader title="Recent records" action={<SeeAll to={appPath('records')}>See all</SeeAll>} />

      {records.isLoading ? (
        <PanelSkeleton label="Loading recent records" />
      ) : records.isError ? (
        <ErrorState
          title="Couldn’t load recent records"
          description={failureText(records.error)}
          action={
            <Button size="sm" variant="secondary" onClick={() => void records.refetch()}>
              Try again
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No consultations recorded yet."
          description="When you complete a visit, write it up and it will appear here."
        />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <OpenRow key={row.id} onOpen={() => onOpen(row.id)}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {partyOf(row.patient).name}
                </span>
                <span className="block truncate text-xs text-muted">{row.diagnosis}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">{formatDate(row.visitDate)}</span>
            </OpenRow>
          ))}
        </ul>
      )}
    </Card>
  );
}

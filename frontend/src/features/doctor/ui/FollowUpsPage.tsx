import { BellRing, CalendarCheck } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { selectRole, useAuthStore } from '@/features/auth';
import { useDoctors } from '@/features/directory';
import type { FollowUpParams, FollowUpRow } from '@/features/patients';
import { ApiError } from '@/shared/api/envelope';
import { formatDate } from '@/shared/lib/format';
import { ADMIN_ROLES } from '@/shared/lib/roles';
import { refId, refObject } from '@/shared/types/domain';
import {
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Pagination,
  Select,
  Tabs,
  type Column,
} from '@/shared/ui';

import { partyOf } from '../model/display';
import { useFollowUps, useSendFollowUpReminders } from '../model/use-doctor';
import { PatientCell } from './PatientCell';
import { RecordDrawer } from './RecordDrawer';

const PAGE_SIZE = 20;

const TABS = [
  {
    id: 'overdue',
    label: 'Overdue',
    params: { overdue: true },
    empty: {
      title: 'Nobody is overdue.',
      description: 'Patients whose follow-up date has passed appear here until they’re seen.',
    },
  },
  {
    id: '7',
    label: 'Next 7 days',
    params: { days: 7 },
    empty: {
      title: 'No follow-ups due in the next 7 days.',
      description: 'Check the next 30 days to plan further ahead.',
    },
  },
  {
    id: '30',
    label: 'Next 30 days',
    params: { days: 30 },
    empty: {
      title: 'No follow-ups due in the next 30 days.',
      description: 'Follow-up dates you set on a consultation appear here as they approach.',
    },
  },
] as const;

type Tab = (typeof TABS)[number];

function tabFromParam(value: string | null): Tab {
  return TABS.find((tab) => tab.id === value) ?? TABS[0];
}

/**
 * Patients a doctor asked to see again: those already past due, and those due
 * soon. The tab is in the link so a view can be shared or returned to.
 *
 * Admin roles see every doctor's follow-ups, with a doctor column and filter,
 * and may send tomorrow's reminders by hand. A doctor sees only their own.
 */
export function FollowUpsPage() {
  const role = useAuthStore(selectRole);
  const isAdmin = Boolean(role && ADMIN_ROLES.includes(role));

  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [doctorId, setDoctorId] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const tab = tabFromParam(params.get('tab'));
  const query: FollowUpParams = {
    ...tab.params,
    ...(isAdmin && doctorId ? { doctorId } : {}),
    page,
    limit: PAGE_SIZE,
  };

  const followUps = useFollowUps(query);
  const remind = useSendFollowUpReminders();
  const rows = followUps.data?.items ?? [];

  const columns: Array<Column<FollowUpRow>> = [
    {
      id: 'patient',
      header: 'Patient',
      cell: (row) => <PatientCell {...partyOf(row.patient)} />,
    },
    { id: 'diagnosis', header: 'Diagnosis', cell: (row) => row.diagnosis },
    {
      id: 'due',
      header: 'Due',
      width: 'w-32',
      cell: (row) => <span className="whitespace-nowrap">{formatDate(row.followUpDate)}</span>,
    },
    {
      id: 'seen',
      header: 'Last visit',
      width: 'w-32',
      hideBelowMd: true,
      cell: (row) => <span className="whitespace-nowrap">{formatDate(row.visitDate)}</span>,
    },
    ...(isAdmin
      ? [
          {
            id: 'doctor',
            header: 'Doctor',
            hideBelowMd: true,
            cell: (row: FollowUpRow) => refObject(row.doctor)?.name ?? 'Unknown doctor',
          },
        ]
      : []),
  ];

  function chooseTab(next: Tab) {
    setPage(1);
    setParams(next.id === TABS[0].id ? {} : { tab: next.id }, { replace: true });
  }

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        description={
          isAdmin
            ? 'Patients doctors have asked to see again.'
            : 'Patients you’ve asked to see again.'
        }
        action={
          isAdmin ? (
            <Button
              variant="secondary"
              leadingIcon={<BellRing className="h-4 w-4" aria-hidden="true" />}
              onClick={() => setConfirming(true)}
            >
              Send reminders
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Tabs
            tabsId="followups"
            label="Follow-up window"
            value={tab.id}
            onChange={(id) => chooseTab(tabFromParam(id))}
            items={TABS}
            layoutId="followups-tab"
          />

          {isAdmin && (
            <DoctorFilter
              value={doctorId}
              onChange={(next) => {
                setDoctorId(next);
                setPage(1);
              }}
            />
          )}
        </div>
      </PageHeader>

      <Card
        id="followups-panel"
        role="tabpanel"
        aria-labelledby={`followups-tab-${tab.id}`}
      >
        {followUps.isError ? (
          <ErrorState
            title="Couldn’t load follow-ups"
            description={
              followUps.error instanceof ApiError
                ? followUps.error.userMessage
                : 'Check your connection, then try again.'
            }
            action={
              <Button size="sm" variant="secondary" onClick={() => void followUps.refetch()}>
                Try again
              </Button>
            }
          />
        ) : !followUps.isLoading && rows.length === 0 ? (
          <EmptyState icon={CalendarCheck} {...tab.empty} />
        ) : (
          <>
            <DataTable
              caption={`Follow-ups: ${tab.label.toLowerCase()}`}
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              isLoading={followUps.isLoading}
              onRowClick={(row) => setOpenId(row.id)}
            />
            {followUps.data && (
              <Pagination
                pagination={followUps.data.pagination}
                onPageChange={setPage}
                unit="follow-up"
              />
            )}
          </>
        )}
      </Card>

      <RecordDrawer recordId={openId} onClose={() => setOpenId(null)} />

      {isAdmin && (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title="Send tomorrow’s reminders?"
          message="Every patient whose follow-up is tomorrow is notified now, whichever doctor they see and whichever tab or filter you’re on."
          confirmLabel="Send reminders"
          cancelLabel="Not now"
          busy={remind.isPending}
          onConfirm={() => remind.mutate(undefined, { onSettled: () => setConfirming(false) })}
        />
      )}
    </div>
  );
}

/** Mounted for admin roles only, so a doctor never asks for the staff directory. */
function DoctorFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (doctorId: string) => void;
}) {
  const doctors = useDoctors({ limit: 100 });

  return (
    <Field label="Doctor" className="w-56">
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All doctors</option>
        {(doctors.data?.items ?? []).map((doctor) => {
          const id = refId(doctor.user);
          return id ? (
            <option key={id} value={id}>
              {refObject(doctor.user)?.name ?? id}
            </option>
          ) : null;
        })}
      </Select>
    </Field>
  );
}

import { FileText } from 'lucide-react';
import { useState } from 'react';

import type { MedicalRecord } from '@/features/patients';
import { ApiError } from '@/shared/api/envelope';
import { formatDate } from '@/shared/lib/format';
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  type Column,
} from '@/shared/ui';

import { partyOf } from '../model/display';
import { useMyAuthoredRecords } from '../model/use-doctor';
import { PatientCell } from './PatientCell';
import { RecordDrawer } from './RecordDrawer';

const PAGE_SIZE = 20;

const columns: Array<Column<MedicalRecord>> = [
  {
    id: 'visit',
    header: 'Visit date',
    width: 'w-32',
    cell: (row) => <span className="whitespace-nowrap">{formatDate(row.visitDate)}</span>,
  },
  { id: 'patient', header: 'Patient', cell: (row) => <PatientCell {...partyOf(row.patient)} /> },
  { id: 'diagnosis', header: 'Diagnosis', cell: (row) => row.diagnosis },
  {
    id: 'followUp',
    header: 'Follow-up',
    width: 'w-32',
    hideBelowMd: true,
    cell: (row) =>
      row.followUpDate ? (
        <span className="whitespace-nowrap">{formatDate(row.followUpDate)}</span>
      ) : (
        <span className="text-muted">None</span>
      ),
  },
];

/**
 * The consultations the signed-in doctor has written, newest first. A row opens
 * the whole record beside the list, so working down the table never loses place.
 */
export function RecordsPage() {
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const records = useMyAuthoredRecords({ page, limit: PAGE_SIZE });
  const rows = records.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="My records"
        description="Consultations you’ve written up, newest first."
      />

      <Card role="region" aria-label="Consultation records">
        {records.isError ? (
          <ErrorState
            title="Couldn’t load your records"
            description={
              records.error instanceof ApiError
                ? records.error.userMessage
                : 'Check your connection, then try again.'
            }
            action={
              <Button size="sm" variant="secondary" onClick={() => void records.refetch()}>
                Try again
              </Button>
            }
          />
        ) : !records.isLoading && rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No consultations recorded yet."
            description="When you complete a visit, write it up and it will appear here."
          />
        ) : (
          <>
            <DataTable
              caption="Consultation records"
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              isLoading={records.isLoading}
              onRowClick={(row) => setOpenId(row.id)}
            />
            {records.data && (
              <Pagination
                pagination={records.data.pagination}
                onPageChange={setPage}
                unit="record"
              />
            )}
          </>
        )}
      </Card>

      <RecordDrawer recordId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

import { motion } from 'framer-motion';
import { Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiError } from '@/shared/api/envelope';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { formatDate } from '@/shared/lib/format';
import { appPath } from '@/shared/lib/routes';
import { fadeSlideUp } from '@/shared/motion/variants';
import type { Patient } from '@/shared/types/domain';
import {
  Badge,
  Card,
  DataTable,
  Input,
  PageHeader,
  Pagination,
  Select,
  type Column,
} from '@/shared/ui';

import { patientName } from '../lib/patient-display';
import { usePatients } from '../model/use-patients';

const PAGE_SIZE = 20;

type AdmissionFilter = 'all' | 'admitted' | 'outpatient';

export function PatientsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [admission, setAdmission] = useState<AdmissionFilter>('all');

  const debouncedSearch = useDebounce(search);

  const params = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(admission === 'all' ? {} : { isAdmitted: admission === 'admitted' }),
    }),
    [page, debouncedSearch, admission]
  );

  const { data, isLoading, error } = usePatients(params);

  const columns = useMemo<Array<Column<Patient>>>(
    () => [
      {
        id: 'name',
        header: 'Patient',
        cell: (patient) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{patientName(patient)}</p>
            <p className="truncate text-xs text-muted">
              {patient.age ? `${patient.age} yrs` : '—'} · {patient.gender}
            </p>
          </div>
        ),
      },
      {
        id: 'mrn',
        header: 'MRN',
        numeric: true,
        width: 'w-36',
        cell: (patient) => patient.medicalRecordNumber ?? '—',
      },
      {
        id: 'blood',
        header: 'Blood',
        width: 'w-20',
        hideBelowMd: true,
        cell: (patient) => patient.bloodGroup ?? '—',
      },
      {
        id: 'ward',
        header: 'Ward',
        hideBelowMd: true,
        cell: (patient) => patient.ward ?? '—',
      },
      {
        id: 'status',
        header: 'Status',
        width: 'w-32',
        cell: (patient) =>
          patient.isAdmitted ? (
            <Badge tone="info">Admitted</Badge>
          ) : (
            <Badge tone="neutral">Outpatient</Badge>
          ),
      },
      {
        id: 'admitted',
        header: 'Admitted',
        numeric: true,
        hideBelowMd: true,
        cell: (patient) => formatDate(patient.admittedAt),
      },
    ],
    []
  );

  return (
    <motion.div variants={fadeSlideUp} initial="hidden" animate="visible">
      <PageHeader
        title="Patients"
        description="Search the register by name, medical record number or ward."
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[16rem] flex-1">
            <Input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search patients…"
              aria-label="Search patients"
              adornment={<Search className="h-4 w-4" />}
            />
          </div>

          <Select
            value={admission}
            aria-label="Admission status"
            className="w-44"
            onChange={(event) => {
              setAdmission(event.target.value as AdmissionFilter);
              setPage(1);
            }}
          >
            <option value="all">All patients</option>
            <option value="admitted">Admitted</option>
            <option value="outpatient">Outpatient</option>
          </Select>
        </div>
      </PageHeader>

      <Card>
        <DataTable
          caption="Patient register"
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(patient) => patient.id}
          isLoading={isLoading}
          error={
            error
              ? {
                  title: 'Could not load patients',
                  description: error instanceof ApiError ? error.userMessage : undefined,
                }
              : null
          }
          onRowClick={(patient) => navigate(appPath(`patients/${patient.id}`))}
          skeletonRows={8}
          empty={{
            icon: Users,
            title: debouncedSearch ? 'No matching patients' : 'No patients yet',
            description: debouncedSearch
              ? 'Try a different name or medical record number.'
              : 'Registered patients will appear here.',
          }}
        />

        {data && <Pagination pagination={data.pagination} onPageChange={setPage} unit="patient" />}
      </Card>
    </motion.div>
  );
}

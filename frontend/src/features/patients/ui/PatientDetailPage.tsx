import { motion } from 'framer-motion';
import { Activity, AlertTriangle, ClipboardList, FileText, Stethoscope } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { Can, useCan } from '@/features/auth';
import { ApiError } from '@/shared/api/envelope';
import { formatDate, formatDateTime, formatRelative, humanizeEnum } from '@/shared/lib/format';
import { ADMIN_ROLES, CLINICAL_ROLES } from '@/shared/lib/roles';
import { fadeSlideUp, staggerItem, staggerList } from '@/shared/motion/variants';
import { refObject } from '@/shared/types/domain';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Metric,
  PageHeader,
  Spinner,
} from '@/shared/ui';

import { patientName } from '../lib/patient-display';
import { useCareLogs, useLatestVitals, useMedicalRecords } from '../model/use-care';
import { useCareTeam, useDischargePatient, usePatient } from '../model/use-patients';

import { ClinicalEditModal } from './ClinicalEditModal';

type Tab = 'care' | 'records';

export function PatientDetailPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const [tab, setTab] = useState<Tab>('care');
  const [editing, setEditing] = useState(false);
  const [confirmDischarge, setConfirmDischarge] = useState(false);

  const { data: patient, isLoading, error } = usePatient(patientId);
  const discharge = useDischargePatient(patientId ?? '');
  const canEditClinical = useCan(CLINICAL_ROLES);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading patient" />
      </div>
    );
  }

  if (error || !patient) {
    return (
      <ErrorState
        title="Could not load this patient"
        description={error instanceof ApiError ? error.userMessage : undefined}
      />
    );
  }

  const name = patientName(patient);

  return (
    <motion.div variants={fadeSlideUp} initial="hidden" animate="visible">
      <PageHeader
        title={name}
        description={`MRN ${patient.medicalRecordNumber ?? '—'} · ${patient.age} yrs · ${humanizeEnum(patient.gender)}`}
        action={
          <div className="flex items-center gap-2">
            {canEditClinical && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit clinical
              </Button>
            )}
            {patient.isAdmitted && (
              <Can roles={[...CLINICAL_ROLES, ...ADMIN_ROLES]}>
                <Button variant="danger" onClick={() => setConfirmDischarge(true)}>
                  Discharge
                </Button>
              </Can>
            )}
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {patient.isAdmitted ? (
            <Badge tone="info">Admitted {formatRelative(patient.admittedAt)}</Badge>
          ) : (
            <Badge tone="neutral">Outpatient</Badge>
          )}
          {patient.bloodGroup && <Badge tone="brand">{patient.bloodGroup}</Badge>}
          {patient.ward && <Badge tone="neutral">{patient.ward}</Badge>}
        </div>
      </PageHeader>

      {/*
        Allergies get a full-width alert rather than a line in a details list.
        This is the one fact on the page that changes what a clinician may
        safely do, so it is not allowed to sit below the fold.
      */}
      {patient.allergies.length > 0 && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-3 rounded-card border border-danger/30 bg-danger-soft px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-display text-sm font-semibold text-danger">Allergies</p>
            <p className="mt-0.5 text-sm text-content">{patient.allergies.join(', ')}</p>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <VitalsPanel patientId={patient.id} />

          <Card>
            <CardHeader
              title="Clinical history"
              action={
                <div className="flex gap-1 rounded-control border border-line p-0.5">
                  <TabButton active={tab === 'care'} onClick={() => setTab('care')}>
                    Care log
                  </TabButton>
                  <TabButton active={tab === 'records'} onClick={() => setTab('records')}>
                    Consultations
                  </TabButton>
                </div>
              }
            />
            {tab === 'care' ? (
              <CareLogList patientId={patient.id} />
            ) : (
              <MedicalRecordList patientId={patient.id} />
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Details" />
            <CardBody className="flex flex-col gap-3 text-sm">
              <DetailRow label="Date of birth" value={formatDate(patient.dateOfBirth)} />
              <DetailRow label="Address" value={patient.address ?? '—'} />
              <DetailRow
                label="Bed"
                value={refObject(patient.bed)?.bedNumber ?? (patient.isAdmitted ? '—' : 'Not admitted')}
              />
              <DetailRow
                label="Chronic conditions"
                value={patient.chronicConditions.length ? patient.chronicConditions.join(', ') : 'None recorded'}
              />
              <DetailRow
                label="Emergency contact"
                value={`${patient.emergencyContact.name} (${patient.emergencyContact.relationship}) · ${patient.emergencyContact.phone}`}
              />
            </CardBody>
          </Card>

          <CareTeamPanel patientId={patient.id} />
        </div>
      </div>

      <ClinicalEditModal
        open={editing}
        onOpenChange={setEditing}
        patient={patient}
      />

      <ConfirmDialog
        open={confirmDischarge}
        onOpenChange={setConfirmDischarge}
        title={`Discharge ${name}?`}
        message="This closes the admission and releases the bed. It cannot be undone from here — a re-admission has to be recorded separately."
        confirmLabel="Discharge"
        busy={discharge.isPending}
        onConfirm={() => {
          discharge.mutate({}, { onSuccess: () => setConfirmDischarge(false) });
        }}
      />
    </motion.div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'rounded-control bg-brand px-2.5 py-1 font-display text-xs font-medium text-brand-fg'
          : 'rounded-control px-2.5 py-1 font-display text-xs font-medium text-muted hover:text-content'
      }
    >
      {children}
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label-eyebrow">{label}</span>
      <span className="text-sm text-content">{value}</span>
    </div>
  );
}

function VitalsPanel({ patientId }: { patientId: string }) {
  const { data, isLoading } = useLatestVitals(patientId);
  const vitals = data?.vitals;

  return (
    <Card>
      <CardHeader
        title="Latest vitals"
        description={data ? `Recorded ${formatRelative(data.recordedAt)}` : undefined}
      />
      <CardBody>
        {isLoading && <Spinner label="Loading vitals" />}
        {!isLoading && !vitals && (
          <EmptyState
            icon={Activity}
            title="No vitals recorded"
            description="Nursing observations will appear here once logged."
          />
        )}
        {vitals && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Metric label="Temp" value={vitals.temperatureC ?? '—'} detail="°C" />
            <Metric label="Heart rate" value={vitals.heartRate ?? '—'} detail="bpm" />
            <Metric
              label="Blood pressure"
              value={
                vitals.systolic && vitals.diastolic ? `${vitals.systolic}/${vitals.diastolic}` : '—'
              }
              detail="mmHg"
            />
            <Metric label="Resp. rate" value={vitals.respiratoryRate ?? '—'} detail="/min" />
            <Metric
              label="SpO₂"
              value={vitals.oxygenSaturation ?? '—'}
              detail="%"
              tone={
                vitals.oxygenSaturation != null && vitals.oxygenSaturation < 92 ? 'danger' : 'default'
              }
            />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function CareLogList({ patientId }: { patientId: string }) {
  const { data, isLoading, error } = useCareLogs(patientId, { limit: 25 });

  if (error) {
    return (
      <ErrorState
        title="Could not load the care log"
        description={error instanceof ApiError ? error.userMessage : undefined}
      />
    );
  }
  if (isLoading) {
    return (
      <CardBody>
        <Spinner label="Loading care log" />
      </CardBody>
    );
  }
  if (!data?.items.length) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Nothing logged yet"
        description="Medications, vitals and observations appear here as they are recorded."
      />
    );
  }

  return (
    <motion.ul
      variants={staggerList}
      initial="hidden"
      animate="visible"
      className="divide-y divide-line"
    >
      {data.items.map((log) => (
        <motion.li key={log.id} variants={staggerItem} className="flex gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={log.requiresAttention ? 'danger' : 'neutral'}>
                {humanizeEnum(log.type)}
              </Badge>
              <span className="text-xs text-muted">{formatDateTime(log.recordedAt)}</span>
              <span className="text-xs text-muted">
                · {refObject(log.recordedBy)?.name ?? 'Staff'}
              </span>
            </div>
            {log.notes && <p className="mt-1 text-sm text-content">{log.notes}</p>}
          </div>
        </motion.li>
      ))}
    </motion.ul>
  );
}

function MedicalRecordList({ patientId }: { patientId: string }) {
  const { data, isLoading, error } = useMedicalRecords(patientId, { limit: 20 });

  if (error) {
    return (
      <ErrorState
        title="Could not load consultations"
        description={error instanceof ApiError ? error.userMessage : undefined}
      />
    );
  }
  if (isLoading) {
    return (
      <CardBody>
        <Spinner label="Loading consultations" />
      </CardBody>
    );
  }
  if (!data?.items.length) {
    return (
      <EmptyState
        icon={FileText}
        title="No consultations recorded"
        description="Doctor visits and diagnoses appear here."
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {data.items.map((record) => (
        <li key={record.id} className="px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">{record.diagnosis}</p>
            <span className="text-xs text-muted">{formatDate(record.visitDate)}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {refObject(record.doctor)?.name ?? 'Doctor'}
            {record.followUpDate ? ` · follow-up ${formatDate(record.followUpDate)}` : ''}
          </p>
          {record.treatment && <p className="mt-1 text-sm text-content">{record.treatment}</p>}
        </li>
      ))}
    </ul>
  );
}

function CareTeamPanel({ patientId }: { patientId: string }) {
  const { data, isLoading } = useCareTeam(patientId);

  return (
    <Card>
      <CardHeader title="Care team" />
      <CardBody>
        {isLoading && <Spinner label="Loading care team" />}
        {!isLoading && (
          <div className="flex flex-col gap-4 text-sm">
            <div>
              <span className="label-eyebrow">Primary doctor</span>
              <p className="mt-1 flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-muted" aria-hidden="true" />
                {data?.primaryDoctor?.name ?? 'Not assigned'}
              </p>
            </div>
            <div>
              <span className="label-eyebrow">Nurses</span>
              {data?.assignedNurses.length ? (
                <ul className="mt-1 flex flex-col gap-1">
                  {data.assignedNurses.map((nurse) => (
                    <li key={nurse.id}>{nurse.name}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-muted">No nurses assigned</p>
              )}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

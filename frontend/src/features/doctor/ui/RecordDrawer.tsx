import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, Paperclip, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';

import { selectRole, selectUser, useAuthStore } from '@/features/auth';
import { ATTACHMENT_LIMITS, type MedicalRecord, type Vitals } from '@/features/patients';
import { ApiError } from '@/shared/api/envelope';
import { formatDate } from '@/shared/lib/format';
import { drawerPanel, modalOverlay } from '@/shared/motion/variants';
import { refId, refObject } from '@/shared/types/domain';
import { Button, ErrorState, Skeleton } from '@/shared/ui';

import { checkAttachments } from '../model/attachments';
import { partyOf } from '../model/display';
import { useAddAttachments, useMedicalRecord } from '../model/use-doctor';

/**
 * One consultation, in full, beside the list it was chosen from — so the doctor
 * keeps their place in the table behind it.
 *
 * Anyone who can read a record can read it here. Only the doctor who wrote it
 * can add files; that is the backend's rule too, and the button is drawn only
 * where it would succeed.
 */
export function RecordDrawer({
  recordId,
  onClose,
}: {
  recordId: string | null;
  onClose: () => void;
}) {
  // The sheet animates out after `recordId` goes null; holding the last id keeps
  // the record on screen for that exit instead of flashing an empty frame.
  const shown = useRef<string | null>(null);
  if (recordId) shown.current = recordId;

  const record = useMedicalRecord(recordId ?? shown.current);
  const open = Boolean(recordId);

  const party = record.data ? partyOf(record.data.patient) : null;
  const doctor = record.data ? refObject(record.data.doctor)?.name : undefined;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-black/40"
                variants={modalOverlay}
                initial="hidden"
                animate="visible"
                exit="hidden"
              />
            </Dialog.Overlay>

            <Dialog.Content asChild forceMount>
              <motion.aside
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-line bg-surface shadow-pop"
                variants={drawerPanel}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
                  <div className="min-w-0">
                    <Dialog.Title className="font-display text-lg font-semibold">
                      {party?.name ?? 'Consultation record'}
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-muted">
                      {record.data
                        ? [
                            party?.mrn,
                            `Seen ${formatDate(record.data.visitDate)}`,
                            doctor,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : 'The full write-up of a visit.'}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close
                    className="-mr-1.5 -mt-1 rounded-control p-2 text-muted transition-colors hover:bg-surface-raised hover:text-content"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Dialog.Close>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                  {record.isLoading ? (
                    <div
                      role="status"
                      aria-busy="true"
                      aria-label="Loading the record"
                      className="flex flex-col gap-5 px-5 py-5"
                    >
                      {Array.from({ length: 4 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-2">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-4 w-4/5" />
                        </div>
                      ))}
                    </div>
                  ) : record.isError || !record.data ? (
                    <ErrorState
                      title="Couldn’t load this record"
                      description={
                        record.error instanceof ApiError
                          ? record.error.userMessage
                          : 'Check your connection, then try again.'
                      }
                      action={
                        <Button size="sm" variant="secondary" onClick={() => void record.refetch()}>
                          Try again
                        </Button>
                      }
                    />
                  ) : (
                    <RecordBody record={record.data} />
                  )}
                </div>
              </motion.aside>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function RecordBody({ record }: { record: MedicalRecord }) {
  const prescriptions = record.prescriptions ?? [];
  const vitals = vitalRows(record.vitals);

  return (
    <div className="divide-y divide-line">
      {record.chiefComplaint && (
        <Section title="Chief complaint">
          <Prose>{record.chiefComplaint}</Prose>
        </Section>
      )}

      <Section title="Diagnosis">
        <Prose>{record.diagnosis}</Prose>
      </Section>

      {record.treatmentPlan && (
        <Section title="Treatment plan">
          <Prose>{record.treatmentPlan}</Prose>
        </Section>
      )}

      {prescriptions.length > 0 && (
        <Section title="Prescriptions">
          <ul className="flex flex-col gap-3">
            {prescriptions.map((line, index) => (
              <li key={`${line.name}-${index}`} className="text-sm">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{line.name}</span>
                  {/* Doses are the strings where one misread character matters. */}
                  <span className="font-mono text-[0.8125rem]">{line.dosage}</span>
                </p>
                {(line.frequency || line.durationDays) && (
                  <p className="text-muted">
                    {[
                      line.frequency,
                      line.durationDays
                        ? `${line.durationDays} ${line.durationDays === 1 ? 'day' : 'days'}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' for ')}
                  </p>
                )}
                {line.instructions && <p className="mt-0.5 text-muted">{line.instructions}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {vitals.length > 0 && (
        <Section title="Vitals">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {vitals.map(({ label, value, unit }) => (
              <div key={label}>
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="text-sm">
                  <span className="numeric font-medium">{value}</span>{' '}
                  <span className="text-muted">{unit}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {record.notes && (
        <Section title="Notes">
          <Prose>{record.notes}</Prose>
        </Section>
      )}

      {record.followUpDate && (
        <Section title="Follow-up">
          <p className="text-sm">Due {formatDate(record.followUpDate)}</p>
        </Section>
      )}

      <AttachmentsSection record={record} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-5 py-4">
      <h3 className="mb-2 font-display text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Prose({ children }: { children: string }) {
  // Clinical notes are written with line breaks; losing them merges a plan into one paragraph.
  return <p className="max-w-prose whitespace-pre-line text-sm leading-relaxed">{children}</p>;
}

const VITAL_ROWS: Array<{ key: keyof Vitals; label: string; unit: string }> = [
  { key: 'temperatureC', label: 'Temperature', unit: '°C' },
  { key: 'heartRateBpm', label: 'Heart rate', unit: 'bpm' },
  { key: 'respiratoryRate', label: 'Respiratory rate', unit: '/min' },
  { key: 'oxygenSaturation', label: 'SpO₂', unit: '%' },
  { key: 'weightKg', label: 'Weight', unit: 'kg' },
  { key: 'painScore', label: 'Pain score', unit: '/10' },
  { key: 'bloodGlucoseMgDl', label: 'Blood glucose', unit: 'mg/dL' },
];

/** Only the readings that were taken; blood pressure is one reading, not two. */
function vitalRows(vitals: Vitals | undefined) {
  if (!vitals) return [];
  const rows: Array<{ label: string; value: string | number; unit: string }> = [];

  if (vitals.systolicBp != null && vitals.diastolicBp != null) {
    rows.push({
      label: 'Blood pressure',
      value: `${vitals.systolicBp}/${vitals.diastolicBp}`,
      unit: 'mmHg',
    });
  }
  for (const { key, label, unit } of VITAL_ROWS) {
    const value = vitals[key];
    if (value != null) rows.push({ label, value, unit });
  }
  return rows;
}

function AttachmentsSection({ record }: { record: MedicalRecord }) {
  const user = useAuthStore(selectUser);
  const role = useAuthStore(selectRole);
  const upload = useAddAttachments(record.id);
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState('');

  const attachments = record.attachments ?? [];
  const isAuthor = role === 'doctor' && Boolean(user) && user?.id === refId(record.doctor);

  function onPick(files: FileList | null) {
    const result = checkAttachments(Array.from(files ?? []), attachments.length);
    if (!result.ok) {
      setProblem(result.message);
      // Without this, picking the same wrong file again fires no change event.
      if (input.current) input.current.value = '';
      return;
    }
    setProblem('');
    upload.mutate(result.files, {
      onSettled: () => {
        if (input.current) input.current.value = '';
      },
    });
  }

  return (
    <section className="px-5 py-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="font-display text-sm font-semibold">Attachments</h3>
        {isAuthor && (
          <>
            <Button
              size="sm"
              variant="secondary"
              loading={upload.isPending}
              onClick={() => input.current?.click()}
            >
              <Paperclip className="h-4 w-4" aria-hidden="true" />
              Attach files
            </Button>
            <input
              ref={input}
              type="file"
              multiple
              accept={ATTACHMENT_LIMITS.accept.join(',')}
              aria-label="Choose files to attach"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => onPick(event.target.files)}
            />
          </>
        )}
      </div>

      {problem && (
        <p role="alert" className="mb-2 text-sm text-danger">
          {problem}
        </p>
      )}

      {attachments.length === 0 ? (
        <p className="text-sm text-muted">
          {isAuthor
            ? 'No files yet. Add scans, lab results or letters as images or PDFs.'
            : 'No files attached.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {attachments.map((file, index) => (
            <li key={`${file.url}-${index}`}>
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex max-w-full items-center gap-2 rounded-control py-1 text-sm text-brand hover:underline"
              >
                <span className="truncate">{file.label ?? fileName(file.url)}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function fileName(url: string): string {
  const last = url.split('?')[0]?.split('/').pop();
  return last ? decodeURIComponent(last) : 'Attachment';
}

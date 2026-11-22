import { AnimatePresence, motion, useReducedMotion, useScroll, type Variants } from 'framer-motion';
import { ChevronDown, FileText } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { HOSPITAL } from '@/content/hospital';
import type { MedicalRecord } from '@/features/patients';
import { ApiError } from '@/shared/api/envelope';
import { cn } from '@/shared/lib/cn';
import { formatDate } from '@/shared/lib/format';
import { appPath } from '@/shared/lib/routes';
import { collapsible, fade, highlightFlash, staggerRow } from '@/shared/motion/variants';
import {
  Button,
  buttonVariants,
  EmergencyStrip,
  ErrorState,
  PageHeader,
  Skeleton,
} from '@/shared/ui';

import { doctorNameOf, readingsOf } from '../model/display';
import {
  attachmentKind,
  nextFollowUp,
  prescriptionLine,
  withYearMarks,
  type JourneyEntry,
} from '../model/journey';
import { useMyJourney } from '../model/use-patient-portal';

/** The id a deep link such as `/app/my-health#record-<id>` points at. */
const RECORD_HASH = /^#record-(.+)$/;

/**
 * The care journey: the dashboard's route, unrolled. One vertical line runs down
 * the left edge with a ring for each visit, newest first. Above "You are here"
 * sits the next follow-up, if the doctor asked for one; below it, the past.
 *
 * Older visits come in 20 at a time from a button, never by scrolling, so the
 * emergency strip at the foot of the page always stays reachable.
 */
export function CareJourneyPage() {
  const journey = useMyJourney();
  const now = new Date();

  const records = useMemo(
    () => journey.data?.pages.flatMap((page) => page.items) ?? [],
    [journey.data]
  );
  // Only the visits that arrived with the first page stagger in. Later batches
  // fade in and leave what is already on screen alone.
  const firstBatch = journey.data?.pages[0]?.items.length ?? 0;
  const entries = withYearMarks(records, now);
  const followUp = nextFollowUp(records, now);

  return (
    <div>
      <PageHeader title="My health" description="Every visit so far, newest first." />

      {journey.isLoading ? (
        <JourneySkeleton />
      ) : journey.isError ? (
        <JourneyError error={journey.error} onRetry={() => void journey.refetch()} />
      ) : (
        <>
          <Timeline entries={entries} firstBatch={firstBatch} followUp={followUp} />

          {journey.hasNextPage && (
            <div className="mt-6 pl-9">
              <Button
                variant="secondary"
                className="min-h-11"
                loading={journey.isFetchingNextPage}
                onClick={() => void journey.fetchNextPage()}
              >
                Show earlier visits
              </Button>
            </div>
          )}
        </>
      )}

      <EmergencyStrip className="mt-8 rounded-card border border-danger/30" />
    </div>
  );
}

function JourneySkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading your care journey"
      className="flex flex-col gap-6 pl-9"
    >
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function JourneyError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  // A patient account with no patient record can never load anything here, so
  // retrying would only repeat the 404. Send them to the people who can fix it.
  if (error instanceof ApiError && error.status === 404) {
    return (
      <ErrorState
        title="We couldn't find your patient record. Please contact the front desk."
        description={HOSPITAL.phone ?? undefined}
      />
    );
  }

  return (
    <ErrorState
      title="Couldn't load your care journey"
      description={
        error instanceof ApiError ? error.userMessage : 'Check your connection, then try again.'
      }
      action={
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}

/** Where the line runs: down the left edge, through the centre of every node. */
const LINE = 'absolute left-[11px] w-0.5 -translate-x-px';

function Timeline({
  entries,
  firstBatch,
  followUp,
}: {
  entries: JourneyEntry[];
  firstBatch: number;
  followUp: MedicalRecord | null;
}) {
  const reduced = useReducedMotion();
  const { hash } = useLocation();

  const listRef = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: listRef, offset: ['start 70%', 'end 70%'] });

  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [flashing, setFlashing] = useState<string | null>(null);
  const handled = useRef<string | null>(null);

  const isEmpty = entries.length === 0;

  // A deep link opens its visit, scrolls to it and flashes it, once per link.
  // Opening is state, not motion, so it happens whether or not the patient has
  // asked for reduced motion; the smooth glide is the CSS's to switch off.
  useEffect(() => {
    const id = RECORD_HASH.exec(hash)?.[1];
    if (!id || handled.current === hash) return;
    if (!entries.some((entry) => entry.record.id === id)) return;

    handled.current = hash;
    setOpen((current) => new Set(current).add(id));
    setFlashing(id);
    document.getElementById(`record-${id}`)?.scrollIntoView({ block: 'center' });
  }, [hash, entries]);

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  return (
    <div>
      {followUp && (
        <ol aria-label="Coming up" className="relative pb-6">
          <li className="relative pl-9">
            <span
              aria-hidden="true"
              className={cn(
                LINE,
                'top-4 -bottom-0 border-l-2 border-dashed border-brand/60 bg-transparent'
              )}
            />
            <span
              aria-hidden="true"
              className="absolute left-[5px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-dashed border-brand bg-canvas"
            />
            <motion.div variants={fade} initial="hidden" animate="visible">
              <p className="text-sm text-muted">Come back on</p>
              <p className="font-display text-base font-semibold">
                <time dateTime={followUp.followUpDate ?? undefined}>
                  {formatDate(followUp.followUpDate)}
                </time>
              </p>
              <p className="text-sm text-muted">{doctorNameOf(followUp.doctor)}</p>
            </motion.div>
          </li>
        </ol>
      )}

      <ol ref={listRef} aria-label="Your visits" className="relative">
        {/* Where the patient has been: a faint track, with the route drawn over it as they scroll. */}
        {!isEmpty && (
          <>
            <span aria-hidden="true" className={cn(LINE, 'top-3 bottom-2 bg-line')} />
            <motion.span
              aria-hidden="true"
              data-testid="route-line"
              className={cn(LINE, 'top-3 bottom-2 bg-brand')}
              style={{ scaleY: reduced ? 1 : scrollYProgress, originY: 0 }}
            />
          </>
        )}

        <li className="relative pb-8 pl-9">
          {isEmpty && (
            <span
              aria-hidden="true"
              className={cn(
                LINE,
                'top-4 -bottom-0 border-l-2 border-dashed border-brand/60 bg-transparent'
              )}
            />
          )}
          <span
            aria-hidden="true"
            className="absolute left-[3px] top-1 h-[18px] w-[18px] rounded-full bg-warm"
          />
          <motion.div variants={fade} initial="hidden" animate="visible">
            <span className="inline-block rounded-control bg-warm px-2 py-0.5 text-sm font-semibold text-warm-fg">
              You are here
            </span>
            <p className="mt-1 text-sm text-muted">Today</p>
          </motion.div>
        </li>

        {isEmpty ? (
          <li className="relative pl-9">
            <span
              aria-hidden="true"
              className="absolute left-[5px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-dashed border-brand bg-canvas"
            />
            <p className="font-display text-base font-semibold">Your first visit</p>
            <p className="mt-1 text-sm text-muted">Your care journey starts at your first visit.</p>
            <Link
              to={appPath('appointments')}
              className={cn(buttonVariants({ size: 'lg' }), 'mt-4 min-h-11')}
            >
              Book an appointment
            </Link>
          </li>
        ) : (
          entries.map((entry, index) => (
            <VisitEvent
              key={entry.record.id}
              entry={entry}
              index={index}
              fromFirstBatch={index < firstBatch}
              expanded={open.has(entry.record.id)}
              flashing={flashing === entry.record.id}
              onToggle={() => toggle(entry.record.id)}
              onFlashed={() => setFlashing(null)}
            />
          ))
        )}
      </ol>
    </div>
  );
}

function VisitEvent({
  entry,
  index,
  fromFirstBatch,
  expanded,
  flashing,
  onToggle,
  onFlashed,
}: {
  entry: JourneyEntry;
  index: number;
  fromFirstBatch: boolean;
  expanded: boolean;
  flashing: boolean;
  onToggle: () => void;
  onFlashed: () => void;
}) {
  const { record, yearMark } = entry;
  const date = formatDate(record.visitDate);
  const panelId = `record-${record.id}-details`;
  const variants: Variants = fromFirstBatch ? staggerRow : fade;

  return (
    <motion.li
      id={`record-${record.id}`}
      className="relative pb-8 pl-9 last:pb-0"
      variants={variants}
      custom={index}
      initial="hidden"
      animate="visible"
    >
      {yearMark && (
        <p className="mb-3 inline-block rounded-control border border-line bg-surface-raised px-2 py-0.5 text-xs font-medium text-muted">
          {yearMark}
        </p>
      )}

      <div className="relative">
        {flashing && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-2 rounded-card bg-warm"
            variants={highlightFlash}
            initial="rest"
            animate="flash"
            onAnimationComplete={onFlashed}
          />
        )}
        <span
          aria-hidden="true"
          className="absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-brand bg-canvas"
        />

        <p className="font-display text-base font-semibold">
          <time dateTime={record.visitDate}>{date}</time>
        </p>
        <p className="text-sm text-muted">{doctorNameOf(record.doctor)}</p>
        <p className="mt-1 line-clamp-2 text-sm">{record.diagnosis}</p>

        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={`${expanded ? 'Hide' : 'Show'} details for ${date}`}
          onClick={onToggle}
          className="mt-1 inline-flex min-h-11 items-center gap-1 rounded-control text-sm font-medium text-brand hover:underline"
        >
          {expanded ? 'Hide details' : 'Show details'}
          <ChevronDown
            aria-hidden="true"
            className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
          />
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="details"
              id={panelId}
              variants={collapsible}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="overflow-hidden"
            >
              <VisitDetails record={record} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-sm">{children}</dd>
    </div>
  );
}

function VisitDetails({ record }: { record: MedicalRecord }) {
  const readings = readingsOf(record.vitals);
  const medicines = (record.prescriptions ?? []).map(prescriptionLine);
  const attachments = record.attachments ?? [];

  return (
    <dl className="flex flex-col gap-4 border-t border-line pb-2 pt-4">
      {record.chiefComplaint && <Section label="Reason for visit">{record.chiefComplaint}</Section>}
      <Section label="What we found">{record.diagnosis}</Section>
      {record.treatmentPlan && <Section label="Plan">{record.treatmentPlan}</Section>}

      {medicines.length > 0 && (
        <div>
          <dt className="text-xs text-muted">Medicines</dt>
          <dd>
            <ul className="mt-1 divide-y divide-line">
              {medicines.map((medicine, i) => (
                <li key={`${medicine.name}-${i}`} className="py-2 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium">{medicine.name}</p>
                  {medicine.summary && <p className="text-sm text-muted">{medicine.summary}</p>}
                  {medicine.instructions && <p className="text-sm">{medicine.instructions}</p>}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      )}

      {readings.length > 0 && (
        <div>
          <dt className="text-xs text-muted">Vitals</dt>
          <dd>
            <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {readings.map((reading) => (
                <div key={reading.label}>
                  <dt className="text-xs text-muted">{reading.label}</dt>
                  <dd className="flex items-baseline gap-1">
                    <span className="numeric text-base font-medium">{reading.value}</span>
                    <span className="text-xs text-muted">{reading.unit}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </dd>
        </div>
      )}

      {record.notes && <Section label="Doctor's notes">{record.notes}</Section>}

      {record.followUpDate && (
        <Section label="Come back on">{formatDate(record.followUpDate)}</Section>
      )}

      {attachments.length > 0 && (
        <div>
          <dt className="text-xs text-muted">Attachments</dt>
          <dd>
            <ul className="mt-1 flex flex-wrap gap-2">
              {attachments.map((attachment) => {
                const label = attachment.label || 'Attachment';
                return (
                  <li key={attachment.url}>
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line px-3 text-sm text-brand hover:underline"
                    >
                      {attachmentKind(attachment) === 'image' ? (
                        <img
                          src={attachment.url}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <FileText aria-hidden="true" className="h-4 w-4 shrink-0" />
                      )}
                      {label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </dd>
        </div>
      )}
    </dl>
  );
}

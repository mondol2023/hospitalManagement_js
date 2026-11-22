import { AnimatePresence, motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import type { PatientWithName } from '@/features/patients';
import { ApiError } from '@/shared/api/envelope';
import { formatDate } from '@/shared/lib/format';
import { appPath } from '@/shared/lib/routes';
import { fadeSlideUp } from '@/shared/motion/variants';
import { refObject } from '@/shared/types/domain';
import { Button, buttonVariants, Card, CardBody, Field, Input, Skeleton } from '@/shared/ui';

import { NAME_NOT_ON_RECORD } from '../model/display';
import { usePatientByMrn } from '../model/use-front-desk';

/** The backend's own limit on an MRN; longer is a typo, not a patient. */
const MAX_MRN_LENGTH = 40;

function admission(patient: PatientWithName): string {
  if (!patient.isAdmitted) return 'Not admitted';
  const bed = refObject(patient.bed);
  const place = [bed?.ward ?? patient.ward, bed?.bedNumber].filter(Boolean).join(' · ');
  return place ? `Admitted · ${place}` : 'Admitted';
}

/**
 * Find a patient by the number on their wristband or letter.
 *
 * The lookup runs on submit only, never as you type: one misread character
 * would fetch a stranger's record. The submitted MRN lives in the page's URL
 * (owned by the page), so "back" returns to the result. The text box keeps what
 * was typed, and after a miss it is re-selected so the next attempt overwrites.
 */
export function MrnLookup({
  submitted,
  onSubmit,
}: {
  submitted: string;
  onSubmit: (mrn: string) => void;
}) {
  const [value, setValue] = useState(submitted);
  const [tooLong, setTooLong] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const lookup = usePatientByMrn(submitted);
  const notFound = lookup.error instanceof ApiError && lookup.error.status === 404;
  const failed = lookup.isError && !notFound;

  // Following a link with `?mrn=` (or pressing back) changes what was submitted
  // without anyone typing, so the box follows it.
  useEffect(() => {
    setValue(submitted);
  }, [submitted]);

  useEffect(() => {
    if (!notFound) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [notFound, submitted]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const typed = value.trim();
    if (!typed) return;
    if (typed.length > MAX_MRN_LENGTH) {
      setTooLong(true);
      return;
    }
    setTooLong(false);

    const normalised = typed.toUpperCase();
    // The same MRN again changes nothing in the URL: ask the server once more
    // instead, so a retry after a miss actually retries.
    if (normalised === submitted.trim().toUpperCase()) void lookup.refetch();
    else onSubmit(normalised);
  }

  const patient = lookup.data;
  const user = refObject(patient?.user);

  return (
    <Card role="region" aria-label="Find a patient">
      <CardBody className="space-y-3">
        <form onSubmit={submit} className="flex items-end gap-2" noValidate>
          <Field
            label="Find a patient by MRN"
            error={tooLong ? 'That doesn’t look like an MRN.' : undefined}
            className="min-w-0 flex-1"
          >
            <Input
              ref={inputRef}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                if (tooLong) setTooLong(false);
              }}
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="MRN-004213"
              className="font-mono"
              adornment={<Search className="h-4 w-4" />}
            />
          </Field>
          <Button type="submit" disabled={lookup.isFetching}>
            Find
          </Button>
        </form>

        <div aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            {submitted && lookup.isLoading ? (
              <motion.div
                key="loading"
                role="status"
                aria-label="Looking up patient"
                variants={fadeSlideUp}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="space-y-2"
              >
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-1/2" />
              </motion.div>
            ) : notFound ? (
              <motion.p
                key="not-found"
                variants={fadeSlideUp}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="text-sm text-muted"
              >
                No patient with MRN <span className="font-mono">{submitted}</span>. Check the number
                on the wristband or letter.
              </motion.p>
            ) : failed ? (
              <motion.div
                key="failed"
                variants={fadeSlideUp}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="flex flex-wrap items-center gap-3 text-sm"
              >
                <p>Couldn’t look that up. Check your connection and try again.</p>
                <Button size="sm" variant="secondary" onClick={() => void lookup.refetch()}>
                  Try again
                </Button>
              </motion.div>
            ) : patient ? (
              <motion.div
                key={patient.id}
                variants={fadeSlideUp}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-card border border-line bg-surface-raised px-4 py-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-display text-base font-semibold">
                      {user?.name ?? NAME_NOT_ON_RECORD}
                    </span>
                    {patient.medicalRecordNumber && (
                      <span className="font-mono text-sm text-muted">
                        {patient.medicalRecordNumber}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted">
                    {patient.dateOfBirth ? `Born ${formatDate(patient.dateOfBirth)} · ` : ''}
                    {admission(patient)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={appPath(`patients/${patient.id}`)}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    Open chart
                  </Link>
                  <Link
                    to={`${appPath('billing')}?patient=${encodeURIComponent(patient.id)}`}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    Bills
                  </Link>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </CardBody>
    </Card>
  );
}

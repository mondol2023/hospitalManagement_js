import { AnimatePresence, motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { HOSPITAL } from '@/content/hospital';
import type { CareTeamDoctor, CareTeamMember } from '@/features/patients';
import { ApiError } from '@/shared/api/envelope';
import { cn } from '@/shared/lib/cn';
import { initials } from '@/shared/lib/format';
import { appPath } from '@/shared/lib/routes';
import { collapsible, staggerRow } from '@/shared/motion/variants';
import {
  Button,
  EmergencyStrip,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '@/shared/ui';

import {
  useMyCareTeam,
  useMyPatient,
  useOpenCareTeamChat,
} from '../model/use-patient-portal';

const TOUCH = 'min-h-11';

/**
 * Who is looking after the patient, and a way to message them.
 *
 * Names, photos and roles only. Staff phone numbers and emails are never sent to
 * a patient (decision D1); the care-team thread is the way to reach them. The
 * urgent note is the page's one warm panel, so it is the thing that stands out.
 */
export function CareTeamPage() {
  const patient = useMyPatient();
  const team = useMyCareTeam();

  // An account with no patient record can load nothing here, so retrying would
  // only repeat the 404. Send them to the people who can fix it.
  if (isNotFound(patient.error)) {
    return (
      <div>
        <PageHeader title="My care team" />
        <ErrorState
          title="We couldn't find your patient record. Please contact the front desk."
          description={HOSPITAL.phone ?? undefined}
        />
        <EmergencyStrip className="mt-8 rounded-card border border-danger/30" />
      </div>
    );
  }

  const doctor = team.data?.primaryDoctor ?? null;
  const nurses = team.data?.nurses ?? [];
  const hasTeam = doctor !== null || nurses.length > 0;
  const admitted = patient.data?.isAdmitted === true;
  // Hidden rather than empty — unless the patient is on the ward, where "no
  // nurses" is a gap worth naming.
  const showNurses = nurses.length > 0 || (admitted && hasTeam);

  return (
    <div>
      <PageHeader title="My care team" description="The people looking after you." />

      {team.isLoading ? (
        <TeamSkeleton />
      ) : team.isError ? (
        <ErrorState
          title="Couldn't load your care team"
          description={
            team.error instanceof ApiError
              ? team.error.userMessage
              : 'Check your connection, then try again.'
          }
          action={
            <Button size="sm" variant="secondary" onClick={() => void team.refetch()}>
              Try again
            </Button>
          }
        />
      ) : !hasTeam ? (
        <EmptyState icon={Users} title="Your care team hasn't been assigned yet." />
      ) : (
        <div className="flex max-w-2xl flex-col gap-6">
          {doctor && (
            <motion.div variants={staggerRow} initial="hidden" animate="visible" custom={0}>
              <DoctorPanel doctor={doctor} />
            </motion.div>
          )}
          {showNurses && (
            <motion.div variants={staggerRow} initial="hidden" animate="visible" custom={1}>
              <NurseList nurses={nurses} />
            </motion.div>
          )}
          <MessageTeam patientId={patient.data?.id} />
        </div>
      )}

      <p
        role="note"
        className="mt-8 max-w-2xl rounded-card bg-warm-soft px-5 py-4 text-sm"
      >
        For anything urgent, call the ward or your local emergency number. Messages are read during
        working hours.
      </p>

      <EmergencyStrip className="mt-8 rounded-card border border-danger/30" />
    </div>
  );
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

function TeamSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading your care team"
      className="flex max-w-2xl flex-col gap-4"
    >
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-4 w-1/4" />
    </div>
  );
}

function Avatar({ name, pic, className }: { name: string; pic?: string; className: string }) {
  return pic ? (
    <img src={pic} alt="" className={cn('shrink-0 rounded-full object-cover', className)} />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand',
        className
      )}
    >
      {initials(name)}
    </span>
  );
}

function DoctorPanel({ doctor }: { doctor: CareTeamDoctor }) {
  return (
    <section
      aria-labelledby="care-team-doctor"
      className="flex items-center gap-4 rounded-card border border-line bg-surface p-5"
    >
      <Avatar name={doctor.name} pic={doctor.profilePic} className="h-14 w-14 text-base" />
      <div className="min-w-0">
        <h2 id="care-team-doctor" className="text-sm text-muted">
          Your doctor
        </h2>
        <p className="font-display text-xl font-semibold">{doctor.name}</p>
        {doctor.specialization && <p className="text-sm text-muted">{doctor.specialization}</p>}
        {doctor.department && <p className="text-sm text-muted">{doctor.department}</p>}
      </div>
    </section>
  );
}

function NurseList({ nurses }: { nurses: CareTeamMember[] }) {
  return (
    <section aria-labelledby="care-team-nurses">
      <h2 id="care-team-nurses" className="mb-2 text-sm text-muted">
        Nurses looking after you
      </h2>
      {nurses.length === 0 ? (
        <p className="text-sm text-muted">The ward will add your nurses when your care starts.</p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {nurses.map((nurse) => (
            <li key={nurse.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={nurse.name} pic={nurse.profilePic} className="h-9 w-9 text-xs" />
              <span className="min-w-0 truncate text-sm font-medium">{nurse.name}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MessageTeam({ patientId }: { patientId: string | undefined }) {
  const open = useOpenCareTeamChat();
  const navigate = useNavigate();

  function message() {
    if (!patientId) return;
    open.mutate(patientId, {
      onSuccess: (conversation) => {
        navigate(`${appPath('messages')}?c=${conversation.id}`);
      },
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          className={TOUCH}
          loading={open.isPending}
          disabled={!patientId || open.isPending}
          onClick={message}
        >
          Message my care team
        </Button>
      </div>
      {/* Grows open rather than popping in, so the button above doesn't jump. */}
      <AnimatePresence initial={false}>
        {open.noCareTeam && (
          <motion.p
            key="no-care-team"
            role="status"
            variants={collapsible}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="overflow-hidden text-sm text-muted"
          >
            Your care team hasn't been assigned yet. The ward will add them when your care starts.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

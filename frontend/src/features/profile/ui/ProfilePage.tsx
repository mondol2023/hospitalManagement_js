import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { selectUser, useAuthStore } from '@/features/auth';
import { formatDateTime, humanizeEnum } from '@/shared/lib/format';
import { appPath } from '@/shared/lib/routes';
import type { User } from '@/shared/types/domain';
import {
  Badge,
  Button,
  Card,
  CardBody,
  ErrorState,
  PageHeader,
  Skeleton,
  SkeletonText,
} from '@/shared/ui';

import {
  profileKindFor,
  useDoctorProfile,
  useNurseProfile,
  usePatientProfile,
  useStaffProfile,
} from '../model/use-profile';
import { AvatarUploader } from './AvatarUploader';
import { DoctorProfileForm } from './DoctorProfileForm';
import { DutyToggle } from './DutyToggle';
import { NurseProfileForm } from './NurseProfileForm';
import { PatientProfileForm } from './PatientProfileForm';
import { ReadOnlyGrid, ReadOnlyRow } from './parts';
import { StaffProfileForm } from './StaffProfileForm';

/**
 * "My profile" — one page for every role, because the person is the same and
 * only the professional section differs.
 *
 * Who you are (name, email, phone) is shown but not editable: the backend has
 * no self-service endpoint for those, and an input that cannot save is worse
 * than text. The role-specific section below it is where self-service lives.
 */
export function ProfilePage() {
  const user = useAuthStore(selectUser);
  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My profile" description="Your details, and how you appear to others." />
      <div className="flex flex-col gap-5">
        <IdentityCard user={user} />
        <RoleSection user={user} />
      </div>
    </div>
  );
}

function IdentityCard({ user }: { user: User }) {
  const isPatient = user.role === 'patient';

  return (
    <Card>
      <CardBody className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-display text-lg font-semibold">{user.name}</p>
            <Badge tone="brand" className="mt-1">
              {humanizeEnum(user.role)}
            </Badge>
          </div>
          {isPatient && <AvatarUploader name={user.name} src={user.profilePic} />}
        </div>

        <ReadOnlyGrid>
          <ReadOnlyRow label="Email">{user.email}</ReadOnlyRow>
          <ReadOnlyRow label="Phone">{user.phone}</ReadOnlyRow>
          <ReadOnlyRow label="Last signed in">
            {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : ''}
          </ReadOnlyRow>
        </ReadOnlyGrid>

        <p className="text-xs text-muted">
          To change your name, email or phone number, ask an administrator.{' '}
          <Link to={appPath('security')} className="font-medium text-brand hover:underline">
            Change your password
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}

function RoleSection({ user }: { user: User }) {
  switch (profileKindFor(user.role)) {
    case 'doctor':
      return <DoctorSection />;
    case 'nurse':
      return <NurseSection />;
    case 'patient':
      return <PatientSection />;
    default:
      return <StaffSection />;
  }
}

function DoctorSection() {
  const query = useDoctorProfile();
  return (
    <Loaded query={query}>
      {(doctor) => (
        <>
          <DutyToggle kind="doctor" isOnDuty={doctor.isOnDuty} />
          <DoctorProfileForm doctor={doctor} />
        </>
      )}
    </Loaded>
  );
}

function NurseSection() {
  const query = useNurseProfile();
  return (
    <Loaded query={query}>
      {(nurse) => (
        <>
          <DutyToggle kind="nurse" isOnDuty={nurse.isOnDuty} />
          <NurseProfileForm nurse={nurse} />
        </>
      )}
    </Loaded>
  );
}

function StaffSection() {
  const query = useStaffProfile();
  return (
    <Loaded query={query}>
      {(member) => (
        <>
          <DutyToggle kind="staff" isOnDuty={member.isOnDuty} />
          <StaffProfileForm member={member} />
        </>
      )}
    </Loaded>
  );
}

function PatientSection() {
  const query = usePatientProfile();
  return <Loaded query={query}>{(patient) => <PatientProfileForm patient={patient} />}</Loaded>;
}

/**
 * Loading and failure for the role section. The form is only mounted once the
 * profile exists, so its fields start with real values instead of flashing
 * empty and then jumping.
 */
function Loaded<T>({
  query,
  children,
}: {
  query: { data: T | undefined; isLoading: boolean; isError: boolean; refetch: () => unknown };
  children: (data: T) => ReactNode;
}) {
  if (query.isLoading) {
    return (
      <Card aria-busy="true">
        <CardBody className="flex flex-col gap-4">
          <Skeleton className="h-5 w-40" />
          <SkeletonText lines={4} />
        </CardBody>
      </Card>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Card>
        <ErrorState
          title="We couldn’t load your profile"
          description="Check your connection, then try again."
          action={
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        />
      </Card>
    );
  }

  return <>{children(query.data)}</>;
}

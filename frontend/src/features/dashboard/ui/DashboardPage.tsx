import { selectRole, selectUser, useAuthStore } from '@/features/auth';
import { DoctorDashboard } from '@/features/doctor';
import { NurseDashboard } from '@/features/nurse';
import {
  AccountantDashboard,
  OpsBoard,
  PharmacistDashboard,
  ReceptionistDashboard,
} from '@/features/operations';
import { PatientDashboard } from '@/features/patient-portal';
import { isStaff } from '@/shared/lib/roles';

/**
 * The signed-in landing page — a per-role switch.
 *
 * `/` is the one route every role can open, so the screen is chosen here, and
 * every role has its own view. A patient gets a way in to their own records —
 * every `/analytics/*` endpoint is `requireStaff`, so the board would be a
 * guaranteed 403 on first paint. The gate here is UX; the backend is still the
 * boundary.
 */
export function DashboardPage() {
  const role = useAuthStore(selectRole);
  const user = useAuthStore(selectUser);

  if (!isStaff(role)) return <PatientDashboard name={user?.name} />;

  if (role === 'nurse') return <NurseDashboard name={user?.name} />;

  if (role === 'doctor') return <DoctorDashboard name={user?.name} />;

  if (role === 'receptionist') return <ReceptionistDashboard name={user?.name} />;

  if (role === 'pharmacist') return <PharmacistDashboard name={user?.name} />;

  if (role === 'accountant') return <AccountantDashboard name={user?.name} />;

  // admin and manager.
  return <OpsBoard name={user?.name} />;
}

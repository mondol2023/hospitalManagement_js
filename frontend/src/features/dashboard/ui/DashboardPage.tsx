import { selectRole, selectUser, useAuthStore } from '@/features/auth';
import { DoctorDashboard } from '@/features/doctor';
import { NurseDashboard } from '@/features/nurse';
import { isStaff } from '@/shared/lib/roles';

import { PatientHome } from './PatientHome';
import { StaffDashboard } from './StaffDashboard';

/**
 * The signed-in landing page — a per-role switch.
 *
 * `/` is the one route every role can open, so the screen is chosen here. Each
 * role gets its own view as its slice ships; a role without one falls back to
 * the screen it had before, so shipping one role never disturbs another. A
 * patient gets a way in to their own records — every `/analytics/*` endpoint is
 * `requireStaff`, so the board would be a guaranteed 403 on first paint. The
 * gate here is UX; the backend is still the boundary.
 */
export function DashboardPage() {
  const role = useAuthStore(selectRole);
  const user = useAuthStore(selectUser);

  if (!isStaff(role)) return <PatientHome name={user?.name} />;

  if (role === 'nurse') return <NurseDashboard name={user?.name} />;

  if (role === 'doctor') return <DoctorDashboard name={user?.name} />;

  return <StaffDashboard name={user?.name} />;
}

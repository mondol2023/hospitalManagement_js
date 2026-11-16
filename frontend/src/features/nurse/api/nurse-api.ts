import { api } from '@/shared/api/client';

/**
 * How full a nurse's caseload is. `assigned` counts admitted patients with this
 * nurse on the care team — the same filter as the caseload list, so the two
 * numbers agree. `capacity` is the nurse's `maxPatients`.
 */
export interface Workload {
  assigned: number;
  capacity: number;
  atCapacity: boolean;
}

/**
 * Nurse-only endpoints that no other feature owns. The nurse's own profile and
 * duty switch live in the profile feature; the on-duty list lives in the directory.
 */
export const nurseApi = {
  workload: () => api.get<Workload>('/nurses/me/workload'),
};

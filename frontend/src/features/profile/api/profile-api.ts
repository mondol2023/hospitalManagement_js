import type { Doctor, Nurse, StaffMember } from '@/features/directory';
import { api } from '@/shared/api/client';
import type { Patient } from '@/shared/types/domain';

import type { DoctorPayload, NursePayload, PatientPayload, StaffPayload } from '../model/profile-forms';

/**
 * Self-service endpoints. Each role has its own `/me`, because each role has
 * its own profile document; the backend resolves "me" from the token, so none
 * of these take an id.
 */
export const profileApi = {
  doctor: {
    get: () => api.get<Doctor>('/doctors/me'),
    update: (input: DoctorPayload) => api.patch<Doctor>('/doctors/me', input),
    setDuty: (isOnDuty: boolean) => api.patch<Doctor>('/doctors/me/duty', { isOnDuty }),
  },

  nurse: {
    get: () => api.get<Nurse>('/nurses/me'),
    update: (input: NursePayload) => api.patch<Nurse>('/nurses/me', input),
    setDuty: (isOnDuty: boolean) => api.patch<Nurse>('/nurses/me/duty', { isOnDuty }),
  },

  staff: {
    get: () => api.get<StaffMember>('/staff/me'),
    update: (input: StaffPayload) => api.patch<StaffMember>('/staff/me', input),
    setDuty: (isOnDuty: boolean) => api.patch<StaffMember>('/staff/me/duty', { isOnDuty }),
  },

  patient: {
    get: () => api.get<Patient>('/patients/me'),
    update: (input: PatientPayload) => api.patch<Patient>('/patients/me', input),

    /**
     * Multipart, field name `file` — the name `singleImage()` reads. The
     * client's default `Content-Type: application/json` is cleared so the
     * browser can write the multipart boundary itself; setting it by hand
     * omits the boundary and the server sees an empty body.
     */
    uploadAvatar: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return api.put<{ profilePic: string }>('/patients/me/avatar', body, {
        headers: { 'Content-Type': undefined },
      });
    },
  },
};

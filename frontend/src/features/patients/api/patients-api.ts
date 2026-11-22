import { api } from '@/shared/api/client';
import type { Page } from '@/shared/api/envelope';
import type { Bed, CareLog, Patient, Ref, UserSummary } from '@/shared/types/domain';

export interface PatientListParams {
  page?: number;
  limit?: number;
  search?: string;
  ward?: string;
  isAdmitted?: boolean;
  sort?: string;
}

/**
 * One person on a care team, as the backend's `careTeamProfile` sends it: a
 * name and a photo, never an email or a phone number (a patient may read this).
 */
export interface CareTeamMember {
  id: string;
  name: string;
  profilePic?: string;
}

export interface CareTeamDoctor extends CareTeamMember {
  specialization?: string;
  department?: string;
}

/**
 * Shared by the staff chart and the patient pages, from both
 * `GET /patients/:id/care-team` and `GET /patients/me/care-team`. A deleted user
 * is left out of `nurses` and turns `primaryDoctor` into `null`.
 */
export interface CareTeamProfile {
  primaryDoctor: CareTeamDoctor | null;
  nurses: CareTeamMember[];
}

/**
 * What `GET /patients/mrn/:mrn` sends: the repository populates `user` (name
 * and photo) and `bed` (number and ward), so the front desk can show who it
 * found and where they are without a second request. Both stay refs, and may
 * be null, because the record behind either can be gone.
 */
export type PatientWithName = Omit<Patient, 'user' | 'bed'> & {
  user: Ref<UserSummary> | null;
  bed?: Ref<Pick<Bed, 'id' | 'bedNumber' | 'ward'>> | null;
};

/** Everything the clinical panel edits, all optional — this is a PATCH. */
export interface ClinicalUpdate {
  bloodGroup?: string;
  allergies?: string[];
  chronicConditions?: string[];
  medicalHistory?: string;
}

export const patientsApi = {
  list: (params: PatientListParams) => api.page<Patient>('/patients', { params }),

  /** The signed-in patient's own record. The only patients endpoint a patient may call. */
  me: () => api.get<Patient>('/patients/me'),

  updateOwn: (input: Partial<Pick<Patient, 'address' | 'emergencyContact'>>) =>
    api.patch<Patient>('/patients/me', input),

  getById: (patientId: string) => api.get<Patient>(`/patients/${patientId}`),

  byMrn: (mrn: string) => api.get<PatientWithName>(`/patients/mrn/${encodeURIComponent(mrn)}`),

  byWard: (ward: string, params?: { page?: number; limit?: number }) =>
    api.page<Patient>(`/patients/ward/${encodeURIComponent(ward)}`, { params }),

  /** A nurse's own assigned patients. */
  caseload: (params?: { page?: number; limit?: number }) =>
    api.page<Patient>('/patients/caseload', { params }),

  updateClinical: (patientId: string, input: ClinicalUpdate) =>
    api.patch<Patient>(`/patients/${patientId}/clinical`, input),

  careTeam: (patientId: string) =>
    api.get<CareTeamProfile>(`/patients/${patientId}/care-team`),

  /** The signed-in patient's own team. A patient may not call the `/:patientId` form. */
  myCareTeam: () => api.get<CareTeamProfile>('/patients/me/care-team'),

  assignNurse: (patientId: string, nurseUserId: string) =>
    api.post<Patient>(`/patients/${patientId}/nurses`, { nurseUserId }),

  removeNurse: (patientId: string, nurseUserId: string) =>
    api.delete<Patient>(`/patients/${patientId}/nurses/${nurseUserId}`),

  setPrimaryDoctor: (patientId: string, doctorUserId: string) =>
    api.patch<Patient>(`/patients/${patientId}/primary-doctor`, { doctorUserId }),

  /**
   * Releases the bed and stamps `dischargedAt`. Irreversible from the UI — the
   * screen gates it behind a ConfirmDialog.
   */
  discharge: (patientId: string, input: { notes?: string }) =>
    api.post<Patient>(`/patients/${patientId}/discharge`, input),
};

export type PatientPage = Page<Patient>;
export type { CareLog };

import { api } from '@/shared/api/client';
import type { Page } from '@/shared/api/envelope';
import type { CareLog, Patient, User } from '@/shared/types/domain';

export interface PatientListParams {
  page?: number;
  limit?: number;
  search?: string;
  ward?: string;
  isAdmitted?: boolean;
  sort?: string;
}

export interface CareTeam {
  primaryDoctor: User | null;
  assignedNurses: User[];
}

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

  byMrn: (mrn: string) => api.get<Patient>(`/patients/mrn/${encodeURIComponent(mrn)}`),

  byWard: (ward: string, params?: { page?: number; limit?: number }) =>
    api.page<Patient>(`/patients/ward/${encodeURIComponent(ward)}`, { params }),

  /** A nurse's own assigned patients. */
  caseload: (params?: { page?: number; limit?: number }) =>
    api.page<Patient>('/patients/caseload', { params }),

  updateClinical: (patientId: string, input: ClinicalUpdate) =>
    api.patch<Patient>(`/patients/${patientId}/clinical`, input),

  careTeam: (patientId: string) => api.get<CareTeam>(`/patients/${patientId}/care-team`),

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

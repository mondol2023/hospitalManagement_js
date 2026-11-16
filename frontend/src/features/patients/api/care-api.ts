import { api } from '@/shared/api/client';
import type {
  CareLog,
  CareLogType,
  Cents,
  ISODateString,
  Patient,
  Ref,
  User,
} from '@/shared/types/domain';

/**
 * Care logs and medical records live in the patients slice rather than in
 * features of their own: neither is ever read outside the context of a patient,
 * and splitting them would mean two more `index.ts` surfaces that only the
 * patient chart imports.
 */

export interface Vitals {
  temperatureC?: number;
  heartRate?: number;
  respiratoryRate?: number;
  systolic?: number;
  diastolic?: number;
  oxygenSaturation?: number;
}

export interface VitalsLog extends CareLog {
  type: 'vitals';
  vitals?: Vitals;
}

export interface CareLogParams {
  page?: number;
  limit?: number;
  type?: CareLogType;
  from?: ISODateString;
  to?: ISODateString;
}

/**
 * Mirrors the backend `handover` validator: summary up to 4000 characters, up
 * to 50 outstanding tasks of up to 300 characters each.
 */
export interface HandoverInput {
  patientId: string;
  toNurseUserId: string;
  summary: string;
  outstandingTasks?: string[];
}

export const HANDOVER_LIMITS = { summary: 4000, tasks: 50, taskLength: 300 } as const;

export const careLogsApi = {
  byPatient: (patientId: string, params?: CareLogParams) =>
    api.page<CareLog>(`/care-logs/patient/${patientId}`, { params }),

  latestVitals: (patientId: string) =>
    api.get<VitalsLog | null>(`/care-logs/patient/${patientId}/vitals/latest`),

  /** Logs flagged `requiresAttention` and not yet acknowledged. */
  attention: (params?: { page?: number; limit?: number; ward?: string }) =>
    api.page<CareLog>('/care-logs/attention', { params }),

  byWard: (ward: string, params?: CareLogParams) =>
    api.page<CareLog>(`/care-logs/ward/${encodeURIComponent(ward)}`, { params }),

  /** What the signed-in clinician recorded themselves, newest first. */
  mine: (params?: CareLogParams) => api.page<CareLog>('/care-logs/me', { params }),

  logVitals: (input: { patientId: string; vitals: Vitals; notes?: string }) =>
    api.post<CareLog>('/care-logs/vitals', input),

  logMedication: (input: {
    patientId: string;
    medicineId?: string;
    name?: string;
    dose?: string;
    notes?: string;
    chargeableCents?: Cents;
  }) => api.post<CareLog>('/care-logs/medications', input),

  logObservation: (input: { patientId: string; notes: string; requiresAttention?: boolean }) =>
    api.post<CareLog>('/care-logs/observations', input),

  logService: (input: { patientId: string; description: string; chargeableCents?: Cents }) =>
    api.post<CareLog>('/care-logs/services', input),

  logProcedure: (input: { patientId: string; description: string; chargeableCents?: Cents }) =>
    api.post<CareLog>('/care-logs/procedures', input),

  logHandover: (input: HandoverInput) => api.post<CareLog>('/care-logs/handovers', input),

  acknowledge: (logId: string) => api.post<CareLog>(`/care-logs/${logId}/acknowledge`),

  /**
   * Care logs are an audit trail, so they are corrected, never edited — the
   * backend keeps the original and appends the correction.
   */
  correct: (logId: string, input: { notes: string }) =>
    api.post<CareLog>(`/care-logs/${logId}/correct`, input),
};

export interface MedicalRecord {
  id: string;
  patient: Ref<Patient>;
  doctor: Ref<User>;
  visitDate: ISODateString;
  diagnosis: string;
  symptoms?: string[];
  treatment?: string;
  prescriptions?: Array<{ medicine?: string; name: string; dosage?: string; duration?: string }>;
  notes?: string;
  followUpDate?: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface MedicalRecordInput {
  patientId: string;
  visitDate?: ISODateString;
  diagnosis: string;
  symptoms?: string[];
  treatment?: string;
  prescriptions?: Array<{ name: string; dosage?: string; duration?: string }>;
  notes?: string;
  followUpDate?: ISODateString | null;
}

export const medicalRecordsApi = {
  byPatient: (patientId: string, params?: { page?: number; limit?: number }) =>
    api.page<MedicalRecord>(`/medical-records/patient/${patientId}`, { params }),

  latest: (patientId: string) =>
    api.get<MedicalRecord | null>(`/medical-records/patient/${patientId}/latest`),

  /** The signed-in patient's own history. */
  mine: (params?: { page?: number; limit?: number }) =>
    api.page<MedicalRecord>('/medical-records/me', { params }),

  followUps: (params?: { page?: number; limit?: number; from?: string; to?: string }) =>
    api.page<MedicalRecord>('/medical-records/follow-ups', { params }),

  getById: (id: string) => api.get<MedicalRecord>(`/medical-records/${id}`),

  create: (input: MedicalRecordInput) => api.post<MedicalRecord>('/medical-records', input),

  update: (id: string, input: Partial<MedicalRecordInput>) =>
    api.patch<MedicalRecord>(`/medical-records/${id}`, input),

  remove: (id: string) => api.delete<{ id: string }>(`/medical-records/${id}`),
};

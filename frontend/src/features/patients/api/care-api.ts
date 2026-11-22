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

/**
 * Mirrors `backend/src/models/schemas/vitals.js`, field for field. The names
 * carry their unit where the backend's do (`heartRateBpm`, `systolicBp`): an
 * earlier version spelled them `heartRate` and `systolic`, which the backend
 * never sent, so the vitals panel showed a dash for every patient.
 */
export interface Vitals {
  temperatureC?: number;
  heartRateBpm?: number;
  systolicBp?: number;
  diastolicBp?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  weightKg?: number;
  /** 0–10, subjective. */
  painScore?: number;
  bloodGlucoseMgDl?: number;
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

/**
 * One prescription line, as stored. `name` is always present on a saved record —
 * the service copies the catalogue name in when a `medicine` link is given — but
 * the form types free text, so `medicine` is never sent from the frontend yet.
 */
export interface Prescription {
  medicine?: string;
  name: string;
  dosage: string;
  frequency?: string;
  durationDays?: number;
  instructions?: string;
}

export interface Attachment {
  url: string;
  label?: string;
  mimeType?: string;
}

/** `Ref<…>` throughout: a list may populate a field and a detail may not, or the reverse. */
export interface MedicalRecord {
  id: string;
  patient: Ref<Patient>;
  doctor: Ref<User>;
  appointment?: string | null;
  visitDate: ISODateString;
  chiefComplaint?: string;
  diagnosis: string;
  treatmentPlan?: string;
  prescriptions?: Prescription[];
  vitals?: Vitals;
  notes?: string;
  attachments?: Attachment[];
  followUpDate?: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * Mirrors the backend `create` validator. Attachments are not part of it: files
 * are uploaded afterwards, against the saved record (`addAttachments`).
 */
export interface MedicalRecordInput {
  patientId: string;
  /** Links the record to the visit it documents; the backend allows one record per appointment. */
  appointmentId?: string;
  visitDate?: ISODateString;
  chiefComplaint?: string;
  diagnosis: string;
  treatmentPlan?: string;
  prescriptions?: Array<Omit<Prescription, 'medicine'>>;
  vitals?: Vitals;
  notes?: string;
  followUpDate?: ISODateString;
}

/** Mirrors the `create` validator's bounds, as `HANDOVER_LIMITS` does for handovers. */
export const CONSULTATION_LIMITS = {
  chiefComplaint: 1000,
  diagnosis: 2000,
  treatmentPlan: 5000,
  notes: 5000,
  prescriptions: 50,
  prescriptionName: 200,
  dosage: 100,
  frequency: 100,
  instructions: 500,
  durationDays: { min: 1, max: 365 },
} as const;

/**
 * Mirrors `middleware/upload.js` (`manyScans`) and the service: 5 files per
 * request, 20 per record, and `UPLOAD_MAX_BYTES` each (5 MB by default — a
 * deployment that raises it makes this check stricter than the server, which is
 * safe). The client checks first so a wrong file is turned away before the
 * upload, not after it. The server also requires the file extension to agree
 * with the type; that part is left to the server.
 */
export const ATTACHMENT_LIMITS = {
  perRequest: 5,
  perRecord: 20,
  maxBytes: 5 * 1024 * 1024,
  accept: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],
} as const;

/** The party fields a list row shows. Populated by the follow-up listing, never a bare id. */
export interface FollowUpRow {
  id: string;
  visitDate: ISODateString;
  followUpDate: ISODateString;
  diagnosis: string;
  patient: Ref<Patient> | null;
  doctor: Ref<User> | null;
}

export interface FollowUpParams {
  page?: number;
  limit?: number;
  /** Upcoming window, 1–30; the backend defaults to 7. Ignored when `overdue`. */
  days?: number;
  overdue?: boolean;
  /** Admin roles only; a doctor naming anyone but themselves gets a 403. */
  doctorId?: string;
}

export const medicalRecordsApi = {
  byPatient: (patientId: string, params?: { page?: number; limit?: number }) =>
    api.page<MedicalRecord>(`/medical-records/patient/${patientId}`, { params }),

  latest: (patientId: string) =>
    api.get<MedicalRecord | null>(`/medical-records/patient/${patientId}/latest`),

  /**
   * Records the signed-in doctor wrote. Doctor-only: the route is not the
   * patient's own history, which is `byPatient('me')`.
   */
  mine: (params?: { page?: number; limit?: number }) =>
    api.page<MedicalRecord>('/medical-records/me', { params }),

  followUps: (params?: FollowUpParams) =>
    api.page<FollowUpRow>('/medical-records/follow-ups', { params }),

  /**
   * Notifies patients whose follow-up falls in the next `days`. Unpaged and not
   * scoped to a doctor, by design: it must reach every due patient.
   */
  remind: (params?: { days?: number }) =>
    api.post<{ due: number; sent: number }>('/medical-records/follow-ups/remind', undefined, {
      params,
    }),

  getById: (id: string) => api.get<MedicalRecord>(`/medical-records/${id}`),

  create: (input: MedicalRecordInput) => api.post<MedicalRecord>('/medical-records', input),

  /**
   * Multipart, field name `files` — the name `manyScans()` reads. The default
   * `Content-Type: application/json` is cleared so the browser writes the
   * boundary itself. Resolves to the whole record, attachments included.
   */
  addAttachments: (id: string, files: File[]) => {
    const body = new FormData();
    for (const file of files) body.append('files', file);
    return api.post<MedicalRecord>(`/medical-records/${id}/attachments`, body, {
      headers: { 'Content-Type': undefined },
    });
  },

  update: (id: string, input: Partial<Omit<MedicalRecordInput, 'patientId' | 'appointmentId'>>) =>
    api.patch<MedicalRecord>(`/medical-records/${id}`, input),

  remove: (id: string) => api.delete<{ id: string }>(`/medical-records/${id}`),
};

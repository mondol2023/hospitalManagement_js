import { patientName } from '@/features/patients';
import { refObject, type Bed, type CareLog, type Patient, type Ref } from '@/shared/types/domain';

/**
 * Turning populated references on a care log or caseload row into words.
 *
 * Every function tolerates a bare id: a reference the backend did not populate
 * is a degraded row, not a crash, and the fallback says so ("Unknown patient")
 * instead of printing a Mongo id at a bedside.
 */

/** The patient on a care log, which arrives as a `Ref<Patient>` rather than a `Patient`. */
export function logPatientName(patient: Ref<Patient> | null | undefined): string {
  const record = refObject(patient);
  return record ? patientName(record) : 'Unknown patient';
}

export function logPatientId(patient: Ref<Patient> | null | undefined): string | null {
  if (patient == null) return null;
  return typeof patient === 'string' ? patient : patient.id;
}

/** "Bed 12B · Ward A", falling back to the ward alone, then to nothing. */
export function bedLabel(patient: Patient): string | null {
  const bed: Bed | null = refObject(patient.bed);
  if (bed) return `Bed ${bed.bedNumber} · ${bed.ward}`;
  return patient.ward ?? null;
}

/** When an entry happened. The backend sends `performedAt`; older shapes sent `recordedAt`. */
export function entryTime(log: Pick<CareLog, 'performedAt' | 'recordedAt' | 'createdAt'>): string {
  return log.performedAt ?? log.recordedAt ?? log.createdAt;
}

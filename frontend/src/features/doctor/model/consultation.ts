import { z } from 'zod';

import { CONSULTATION_LIMITS, type MedicalRecordInput, type Vitals } from '@/features/patients';

/**
 * The consultation form's values and rules.
 *
 * Every field is a string while the doctor types — a half-typed "36." is not a
 * number yet — and is turned into the wire shape only on submit
 * (`toConsultationInput`). The bounds mirror `backend/src/validators/vitals.js`
 * and `medicalRecord.js`, so a value the server would refuse is refused next to
 * the field instead of after the round trip.
 */

type VitalKey = keyof Vitals;

interface VitalField {
  key: VitalKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  /** The backend casts these with `.int()`. */
  integer: boolean;
}

export const VITAL_FIELDS: readonly VitalField[] = [
  { key: 'temperatureC', label: 'Temperature', unit: '°C', min: 25, max: 45, integer: false },
  { key: 'heartRateBpm', label: 'Heart rate', unit: 'bpm', min: 20, max: 300, integer: true },
  { key: 'systolicBp', label: 'Systolic BP', unit: 'mmHg', min: 40, max: 300, integer: true },
  { key: 'diastolicBp', label: 'Diastolic BP', unit: 'mmHg', min: 20, max: 200, integer: true },
  { key: 'respiratoryRate', label: 'Resp. rate', unit: '/min', min: 4, max: 80, integer: true },
  { key: 'oxygenSaturation', label: 'SpO₂', unit: '%', min: 50, max: 100, integer: false },
  { key: 'weightKg', label: 'Weight', unit: 'kg', min: 0, max: 500, integer: false },
  { key: 'painScore', label: 'Pain score', unit: '0–10', min: 0, max: 10, integer: true },
  { key: 'bloodGlucoseMgDl', label: 'Glucose', unit: 'mg/dL', min: 10, max: 1000, integer: false },
];

export interface PrescriptionDraft {
  name: string;
  dosage: string;
  frequency: string;
  durationDays: string;
  instructions: string;
}

export interface ConsultationFormValues {
  chiefComplaint: string;
  diagnosis: string;
  treatmentPlan: string;
  vitals: Record<VitalKey, string>;
  prescriptions: PrescriptionDraft[];
  notes: string;
  /** `YYYY-MM-DD`, or empty for no follow-up. */
  followUpDate: string;
}

export function emptyPrescription(): PrescriptionDraft {
  return { name: '', dosage: '', frequency: '', durationDays: '', instructions: '' };
}

export function emptyConsultation(): ConsultationFormValues {
  return {
    chiefComplaint: '',
    diagnosis: '',
    treatmentPlan: '',
    vitals: Object.fromEntries(VITAL_FIELDS.map((field) => [field.key, ''])) as Record<
      VitalKey,
      string
    >,
    prescriptions: [],
    notes: '',
    followUpDate: '',
  };
}

const isBlank = (value: string) => value.trim() === '';

const isBlankLine = (line: PrescriptionDraft) => Object.values(line).every(isBlank);

/** Today's date as the doctor's calendar shows it — not UTC, which can still be yesterday. */
export function localToday(): string {
  const now = new Date();
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const text = (max: number, what: string) =>
  z.string().max(max, `${what} can be at most ${max} characters`);

const prescriptionLine = z.object({
  name: text(CONSULTATION_LIMITS.prescriptionName, 'The medicine name'),
  dosage: text(CONSULTATION_LIMITS.dosage, 'The dosage'),
  frequency: text(CONSULTATION_LIMITS.frequency, 'The frequency'),
  durationDays: z.string(),
  instructions: text(CONSULTATION_LIMITS.instructions, 'The instructions'),
});

export const consultationSchema = z
  .object({
    chiefComplaint: text(CONSULTATION_LIMITS.chiefComplaint, 'The complaint'),
    diagnosis: z
      .string()
      .trim()
      .min(1, 'Enter a diagnosis')
      .max(CONSULTATION_LIMITS.diagnosis, `The diagnosis can be at most ${CONSULTATION_LIMITS.diagnosis} characters`),
    treatmentPlan: text(CONSULTATION_LIMITS.treatmentPlan, 'The plan'),
    vitals: z.record(z.string(), z.string()),
    prescriptions: z
      .array(prescriptionLine)
      .max(CONSULTATION_LIMITS.prescriptions, `At most ${CONSULTATION_LIMITS.prescriptions} prescription lines`),
    notes: text(CONSULTATION_LIMITS.notes, 'The notes'),
    followUpDate: z.string(),
  })
  .superRefine((form, ctx) => {
    for (const field of VITAL_FIELDS) {
      const raw = (form.vitals[field.key] ?? '').trim();
      if (raw === '') continue;
      const value = Number(raw);
      const problem = !Number.isFinite(value)
        ? 'Enter a number'
        : field.integer && !Number.isInteger(value)
          ? 'Enter a whole number'
          : value < field.min || value > field.max
            ? `${field.min}–${field.max} ${field.unit}`
            : null;
      if (problem) ctx.addIssue({ code: 'custom', path: ['vitals', field.key], message: problem });
    }

    form.prescriptions.forEach((line, index) => {
      if (isBlankLine(line)) return;
      const at = (key: keyof PrescriptionDraft, message: string) =>
        ctx.addIssue({ code: 'custom', path: ['prescriptions', index, key], message });

      if (isBlank(line.name)) at('name', 'Enter the medicine');
      if (isBlank(line.dosage)) at('dosage', 'Enter the dosage');

      if (!isBlank(line.durationDays)) {
        const days = Number(line.durationDays);
        const { min, max } = CONSULTATION_LIMITS.durationDays;
        if (!Number.isInteger(days) || days < min || days > max) {
          at('durationDays', `${min}–${max} days`);
        }
      }
    });

    if (!isBlank(form.followUpDate) && form.followUpDate < localToday()) {
      ctx.addIssue({
        code: 'custom',
        path: ['followUpDate'],
        message: 'The follow-up can’t be in the past',
      });
    }
  });

/**
 * The wire payload: trimmed, with empty optionals left out rather than sent as
 * `""`, blank prescription lines dropped, and numbers as numbers. Assumes the
 * values already passed `consultationSchema`.
 */
export function toConsultationInput(
  form: ConsultationFormValues,
  context: { patientId: string; appointmentId?: string }
): MedicalRecordInput {
  const optional = (value: string) => (isBlank(value) ? {} : { value: value.trim() });

  const chiefComplaint = optional(form.chiefComplaint).value;
  const treatmentPlan = optional(form.treatmentPlan).value;
  const notes = optional(form.notes).value;

  const vitals: Vitals = {};
  for (const field of VITAL_FIELDS) {
    const raw = form.vitals[field.key];
    if (!isBlank(raw)) vitals[field.key] = Number(raw);
  }

  const prescriptions = form.prescriptions
    .filter((line) => !isBlankLine(line))
    .map((line) => ({
      name: line.name.trim(),
      dosage: line.dosage.trim(),
      ...(!isBlank(line.frequency) && { frequency: line.frequency.trim() }),
      ...(!isBlank(line.durationDays) && { durationDays: Number(line.durationDays) }),
      ...(!isBlank(line.instructions) && { instructions: line.instructions.trim() }),
    }));

  return {
    patientId: context.patientId,
    ...(context.appointmentId && { appointmentId: context.appointmentId }),
    diagnosis: form.diagnosis.trim(),
    ...(chiefComplaint && { chiefComplaint }),
    ...(treatmentPlan && { treatmentPlan }),
    ...(notes && { notes }),
    ...(Object.keys(vitals).length > 0 && { vitals }),
    ...(prescriptions.length > 0 && { prescriptions }),
    ...(!isBlank(form.followUpDate) && { followUpDate: `${form.followUpDate}T00:00:00.000Z` }),
  };
}

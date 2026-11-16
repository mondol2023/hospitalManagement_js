import { z } from 'zod';

import type { Doctor, Nurse, StaffMember } from '@/features/directory';
import { centsToInputValue, parseMoneyToCents } from '@/shared/lib/money';
import type { Patient } from '@/shared/types/domain';

/**
 * Forms for editing your own profile — one schema and one pair of mappers per
 * role. Each payload mapper sends **only** what the backend's `updateOwn`
 * accepts for that role. The backend would reject the extras anyway; not
 * sending them means the form cannot even attempt to edit its own ward
 * assignment, grade or employee number.
 *
 * Form values are strings (that is what inputs hold); the mappers own the
 * conversion in both directions, so a component never does arithmetic on a
 * fee or slices an ISO date.
 */

export const SHIFT_OPTIONS = ['morning', 'evening', 'night', 'on_call'] as const;

export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const text = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);
const requiredText = (max: number, what: string) =>
  z.string().trim().min(1, `Enter ${what}`).max(max, `Keep this under ${max} characters`);

const wholeNumber = (what: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((value) => /^\d+$/.test(value), `Enter ${what} as a whole number`)
    .refine(
      (value) => Number(value) >= min && Number(value) <= max,
      `${what[0]?.toUpperCase()}${what.slice(1)} must be between ${min} and ${max}`
    );

const shift = z.enum(['', ...SHIFT_OPTIONS]);

// ── Doctor ───────────────────────────────────────────────────────────────────

const timeSlotForm = z
  .object({
    start: z.string().regex(TIME, 'Use HH:mm, like 09:00'),
    end: z.string().regex(TIME, 'Use HH:mm, like 12:00'),
  })
  .refine((slot) => !TIME.test(slot.start) || !TIME.test(slot.end) || slot.start < slot.end, {
    message: 'End time must be after the start time',
    path: ['end'],
  });

export const doctorFormSchema = z.object({
  specialization: requiredText(120, 'a specialization'),
  qualifications: requiredText(200, 'your qualifications'),
  licenseNumber: text(60),
  experienceInYears: wholeNumber('years of experience', 0, 80),
  consultationFee: z
    .string()
    .trim()
    .refine((value) => {
      const cents = parseMoneyToCents(value);
      return cents !== null && cents >= 0;
    }, 'Enter a fee like 120 or 120.50'),
  slotDurationMinutes: wholeNumber('slot length', 5, 240),
  availableDays: z.array(z.enum(WEEKDAYS)),
  timeSlots: z.array(timeSlotForm).max(12, 'Twelve time slots is the most a day can hold'),
  isAcceptingPatients: z.boolean(),
  department: text(120),
  shift,
});

export type DoctorFormValues = z.infer<typeof doctorFormSchema>;

export function doctorToForm(doctor: Doctor): DoctorFormValues {
  return {
    specialization: doctor.specialization ?? '',
    qualifications: doctor.qualifications ?? '',
    licenseNumber: doctor.licenseNumber ?? '',
    experienceInYears: String(doctor.experienceInYears ?? 0),
    consultationFee: centsToInputValue(doctor.consultationFeeCents ?? 0),
    slotDurationMinutes: String(doctor.slotDurationMinutes ?? 30),
    availableDays: (doctor.availableDays ?? []) as DoctorFormValues['availableDays'],
    timeSlots: (doctor.timeSlots ?? []).map(({ start, end }) => ({ start, end })),
    isAcceptingPatients: doctor.isAcceptingPatients ?? true,
    department: doctor.department ?? '',
    shift: (doctor.shift ?? '') as DoctorFormValues['shift'],
  };
}

export function doctorPayload(values: DoctorFormValues) {
  return {
    specialization: values.specialization,
    qualifications: values.qualifications,
    licenseNumber: values.licenseNumber,
    experienceInYears: Number(values.experienceInYears),
    consultationFeeCents: parseMoneyToCents(values.consultationFee) ?? 0,
    availableDays: values.availableDays,
    timeSlots: values.timeSlots,
    slotDurationMinutes: Number(values.slotDurationMinutes),
    isAcceptingPatients: values.isAcceptingPatients,
    department: values.department,
    // An enum cannot be sent empty; leaving it out keeps what is stored.
    ...(values.shift ? { shift: values.shift } : {}),
  };
}

export type DoctorPayload = ReturnType<typeof doctorPayload>;

// ── Nurse ────────────────────────────────────────────────────────────────────

export const nurseFormSchema = z.object({
  qualifications: requiredText(200, 'your qualifications'),
  licenseNumber: text(60),
  experienceInYears: wholeNumber('years of experience', 0, 60),
  department: text(120),
  shift,
});

export type NurseFormValues = z.infer<typeof nurseFormSchema>;

export function nurseToForm(nurse: Nurse): NurseFormValues {
  return {
    qualifications: nurse.qualifications ?? '',
    licenseNumber: nurse.licenseNumber ?? '',
    experienceInYears: String(nurse.experienceInYears ?? 0),
    department: nurse.department ?? '',
    shift: (nurse.shift ?? '') as NurseFormValues['shift'],
  };
}

export function nursePayload(values: NurseFormValues) {
  return {
    qualifications: values.qualifications,
    licenseNumber: values.licenseNumber,
    experienceInYears: Number(values.experienceInYears),
    department: values.department,
    ...(values.shift ? { shift: values.shift } : {}),
  };
}

export type NursePayload = ReturnType<typeof nursePayload>;

// ── Staff (reception, pharmacy, accounts, management, admin) ─────────────────

export const staffFormSchema = z.object({
  department: text(120),
  shift,
  notes: text(1000),
});

export type StaffFormValues = z.infer<typeof staffFormSchema>;

export function staffToForm(member: StaffMember): StaffFormValues {
  return {
    department: member.department ?? '',
    shift: (member.shift ?? '') as StaffFormValues['shift'],
    notes: member.notes ?? '',
  };
}

export function staffPayload(values: StaffFormValues) {
  return {
    department: values.department,
    notes: values.notes,
    ...(values.shift ? { shift: values.shift } : {}),
  };
}

export type StaffPayload = ReturnType<typeof staffPayload>;

// ── Patient ──────────────────────────────────────────────────────────────────

export const patientFormSchema = z.object({
  address: text(500),
  dateOfBirth: z
    .string()
    .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Enter a valid date')
    .refine((value) => value === '' || new Date(value).getTime() <= Date.now(), {
      message: 'Date of birth cannot be in the future',
    }),
  emergencyContact: z.object({
    name: requiredText(120, 'a contact name'),
    relationship: requiredText(60, 'how they are related to you'),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{7,15}$/, 'Digits only, 7–15 of them, with an optional leading +'),
    email: z
      .string()
      .trim()
      .refine((value) => value === '' || z.string().email().safeParse(value).success, 'Enter a valid email'),
  }),
});

export type PatientFormValues = z.infer<typeof patientFormSchema>;

export function patientToForm(patient: Patient): PatientFormValues {
  return {
    address: patient.address ?? '',
    dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.slice(0, 10) : '',
    emergencyContact: {
      name: patient.emergencyContact?.name ?? '',
      relationship: patient.emergencyContact?.relationship ?? '',
      phone: patient.emergencyContact?.phone ?? '',
      email: patient.emergencyContact?.email ?? '',
    },
  };
}

export function patientPayload(values: PatientFormValues) {
  const { name, relationship, phone, email } = values.emergencyContact;
  return {
    address: values.address,
    ...(values.dateOfBirth ? { dateOfBirth: values.dateOfBirth } : {}),
    emergencyContact: { name, relationship, phone, ...(email ? { email } : {}) },
  };
}

export type PatientPayload = ReturnType<typeof patientPayload>;

// ── Avatar ───────────────────────────────────────────────────────────────────

export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/**
 * The server enforces the same two rules (`upload.js`); checking here means a
 * 12 MB phone photo is turned away in a millisecond, not after a long upload.
 * Returns the message to show, or null when the file is fine.
 */
export function validateAvatar(file: File): string | null {
  if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) {
    return 'Choose a JPEG, PNG, WebP or GIF image.';
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return 'That image is over 5 MB. Choose a smaller one, or shrink it first.';
  }
  return null;
}

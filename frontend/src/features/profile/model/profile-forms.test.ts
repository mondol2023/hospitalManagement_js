import { describe, expect, it } from 'vitest';

import type { Doctor, Nurse, StaffMember } from '@/features/directory';
import type { Patient } from '@/shared/types/domain';

import {
  doctorFormSchema,
  doctorPayload,
  doctorToForm,
  nursePayload,
  nurseToForm,
  patientFormSchema,
  patientPayload,
  patientToForm,
  staffPayload,
  staffToForm,
  validateAvatar,
} from './profile-forms';

const doctor = {
  id: 'd1',
  specialization: 'Cardiology',
  qualifications: 'MBBS, MD',
  licenseNumber: 'LIC-9',
  experienceInYears: 12,
  consultationFeeCents: 12_550,
  availableDays: ['monday', 'friday'],
  timeSlots: [{ start: '09:00', end: '12:00' }],
  slotDurationMinutes: 30,
  isAcceptingPatients: true,
  department: 'Heart centre',
  shift: 'morning',
} as unknown as Doctor;

describe('doctor form', () => {
  it('shows the fee in dollars, not cents', () => {
    expect(doctorToForm(doctor).consultationFee).toBe('125.50');
  });

  it('round-trips a doctor into the payload the backend accepts', () => {
    expect(doctorPayload(doctorFormSchema.parse(doctorToForm(doctor)))).toEqual({
      specialization: 'Cardiology',
      qualifications: 'MBBS, MD',
      licenseNumber: 'LIC-9',
      experienceInYears: 12,
      consultationFeeCents: 12_550,
      availableDays: ['monday', 'friday'],
      timeSlots: [{ start: '09:00', end: '12:00' }],
      slotDurationMinutes: 30,
      isAcceptingPatients: true,
      department: 'Heart centre',
      shift: 'morning',
    });
  });

  it('never sends fields the backend forbids a doctor to change', () => {
    const payload = doctorPayload(doctorFormSchema.parse(doctorToForm(doctor)));
    expect(payload).not.toHaveProperty('employeeId');
    expect(payload).not.toHaveProperty('isOnDuty');
  });

  it('omits an unset shift rather than sending an empty enum', () => {
    const form = { ...doctorToForm(doctor), shift: '' };
    expect(doctorPayload(doctorFormSchema.parse(form))).not.toHaveProperty('shift');
  });

  it('lets a doctor clear an optional text field', () => {
    const form = { ...doctorToForm(doctor), licenseNumber: '' };
    expect(doctorPayload(doctorFormSchema.parse(form)).licenseNumber).toBe('');
  });

  it('rounds the fee to whole cents', () => {
    const form = { ...doctorToForm(doctor), consultationFee: '19.999' };
    expect(doctorPayload(doctorFormSchema.parse(form)).consultationFeeCents).toBe(2000);
  });

  it('rejects a slot that ends before it starts', () => {
    const form = { ...doctorToForm(doctor), timeSlots: [{ start: '12:00', end: '09:00' }] };
    const result = doctorFormSchema.safeParse(form);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['timeSlots', 0, 'end']);
  });

  it.each([
    ['consultationFee', '-5'],
    ['consultationFee', 'abc'],
    ['experienceInYears', '81'],
    ['slotDurationMinutes', '4'],
    ['specialization', '  '],
  ])('rejects %s = %s', (field, value) => {
    const form = { ...doctorToForm(doctor), [field]: value };
    expect(doctorFormSchema.safeParse(form).success).toBe(false);
  });
});

describe('nurse form', () => {
  const nurse = {
    qualifications: 'BSN',
    licenseNumber: undefined,
    experienceInYears: 4,
    department: 'Ward B',
    shift: 'night',
    assignedWards: ['B'],
    grade: 'senior_nurse',
    maxPatients: 8,
  } as unknown as Nurse;

  it('sends only the five fields a nurse owns — not wards, grade or caseload', () => {
    expect(nursePayload(nurseToForm(nurse))).toEqual({
      qualifications: 'BSN',
      licenseNumber: '',
      experienceInYears: 4,
      department: 'Ward B',
      shift: 'night',
    });
  });
});

describe('staff form', () => {
  it('sends department, shift and notes only', () => {
    const member = {
      department: 'Front desk',
      shift: 'evening',
      notes: undefined,
      designation: 'Receptionist',
      employmentType: 'full_time',
    } as unknown as StaffMember;
    expect(staffPayload(staffToForm(member))).toEqual({
      department: 'Front desk',
      shift: 'evening',
      notes: '',
    });
  });
});

describe('patient form', () => {
  const patient = {
    address: '12 Elm St',
    dateOfBirth: '1990-04-02T00:00:00.000Z',
    emergencyContact: { name: 'Sam', relationship: 'Sibling', phone: '+15551234567' },
  } as unknown as Patient;

  it('turns the stored timestamp into a date input value', () => {
    expect(patientToForm(patient).dateOfBirth).toBe('1990-04-02');
  });

  it('omits an empty emergency email and an empty date of birth', () => {
    const form = { ...patientToForm(patient), dateOfBirth: '' };
    const payload = patientPayload(patientFormSchema.parse(form));
    expect(payload.emergencyContact).toEqual({
      name: 'Sam',
      relationship: 'Sibling',
      phone: '+15551234567',
    });
    expect(payload).not.toHaveProperty('dateOfBirth');
  });

  it('does not let a patient send clinical fields', () => {
    const payload = patientPayload(patientFormSchema.parse(patientToForm(patient)));
    expect(Object.keys(payload).sort()).toEqual(['address', 'dateOfBirth', 'emergencyContact']);
  });

  it('rejects an emergency phone the backend would reject', () => {
    const form = {
      ...patientToForm(patient),
      emergencyContact: { ...patientToForm(patient).emergencyContact, phone: '555-1234' },
    };
    expect(patientFormSchema.safeParse(form).success).toBe(false);
  });
});

describe('validateAvatar', () => {
  const file = (type: string, size: number) =>
    new File([new Uint8Array(size)], 'me', { type });

  it('accepts a small image', () => {
    expect(validateAvatar(file('image/png', 1024))).toBeNull();
  });

  it('refuses something that is not an image the server takes', () => {
    expect(validateAvatar(file('application/pdf', 1024))).toMatch(/JPEG, PNG, WebP or GIF/);
  });

  it('refuses a file over 5 MB and says the limit', () => {
    expect(validateAvatar(file('image/jpeg', 5 * 1024 * 1024 + 1))).toMatch(/5 MB/);
  });
});

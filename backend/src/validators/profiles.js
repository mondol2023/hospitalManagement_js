'use strict';

const { z, objectId, shortText, optionalText, minorUnits } = require('./common');
const { ROLES, SHIFT_VALUES, BLOOD_GROUPS, GENDERS } = require('../utils/constants');
const { DAYS } = require('../models/Doctor');

/**
 * Role-specific profile shapes.
 *
 * One definition serves both entry points: an admin creating an account
 * (`POST /users`, where the profile is nested) and the employee editing their
 * own profile later (`PATCH /doctors/me`). Duplicating them is how the two
 * drift, and a field accepted at signup but rejected on edit is a bug nobody
 * finds until a doctor tries to change their fee.
 *
 * `employeeId` is optional everywhere: HR usually issues one, and when nobody
 * does `profileService` mints it.
 */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const employment = {
  employeeId: z.string().trim().toUpperCase().max(32).optional(),
  department: z.string().trim().max(120).optional(),
  shift: z.enum(SHIFT_VALUES).optional(),
};

const timeSlot = z
  .object({ start: z.string().regex(TIME, 'expected HH:mm'), end: z.string().regex(TIME, 'expected HH:mm') })
  .refine((slot) => slot.start < slot.end, {
    message: 'end must be after start',
    path: ['end'],
  });

const doctorProfile = z.object({
  ...employment,
  specialization: shortText(120),
  qualifications: shortText(200),
  licenseNumber: z.string().trim().max(60).optional(),
  experienceInYears: z.coerce.number().int().min(0).max(80).optional(),
  consultationFeeCents: minorUnits.optional(),
  availableDays: z.array(z.enum(DAYS)).max(7).optional(),
  timeSlots: z.array(timeSlot).max(12).optional(),
  slotDurationMinutes: z.coerce.number().int().min(5).max(240).optional(),
  isAcceptingPatients: z.boolean().optional(),
});

const nurseProfile = z.object({
  ...employment,
  qualifications: shortText(200),
  licenseNumber: z.string().trim().max(60).optional(),
  experienceInYears: z.coerce.number().int().min(0).max(60).optional(),
  assignedWards: z.array(shortText(60)).max(20).optional(),
  grade: z.enum(['trainee', 'staff_nurse', 'senior_nurse', 'head_nurse']).optional(),
  supervisor: objectId.optional(),
  maxPatients: z.coerce.number().int().min(1).max(60).optional(),
});

const staffProfile = z.object({
  ...employment,
  designation: shortText(120),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern']).optional(),
  reportsTo: objectId.optional(),
  salaryCents: minorUnits.optional(),
  notes: optionalText(1000),
});

const patientProfile = z.object({
  age: z.coerce.number().int().min(0).max(150),
  gender: z.enum(GENDERS),
  bloodGroup: z.enum(BLOOD_GROUPS).optional(),
  allergies: z.array(shortText(120)).max(50).optional(),
  chronicConditions: z.array(shortText(120)).max(50).optional(),
  emergencyContact: z.object({
    name: shortText(120),
    relationship: shortText(60),
    phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/, 'Invalid phone number'),
    email: z.string().trim().toLowerCase().email().optional(),
  }),
});

/**
 * The profile that goes with a role. Discriminating on the role means
 * `POST /users` with `role: 'doctor'` cannot be satisfied by a nurse's profile
 * body — the required clinical fields differ, and accepting the wrong one
 * produces a profile that fails Mongoose validation deep inside a transaction.
 */
const PROFILE_BY_ROLE = Object.freeze({
  [ROLES.DOCTOR]: doctorProfile,
  [ROLES.NURSE]: nurseProfile,
  [ROLES.PATIENT]: patientProfile,
  [ROLES.RECEPTIONIST]: staffProfile,
  [ROLES.PHARMACIST]: staffProfile,
  [ROLES.ACCOUNTANT]: staffProfile,
  [ROLES.MANAGER]: staffProfile,
  [ROLES.ADMIN]: staffProfile,
});

module.exports = {
  doctorProfile,
  nurseProfile,
  staffProfile,
  patientProfile,
  timeSlot,
  employment,
  PROFILE_BY_ROLE,
};

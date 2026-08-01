'use strict';

const { User, Patient, Doctor, Nurse, Staff, Bed } = require('../../src/models');
const tokenService = require('../../src/services/tokenService');
const { ROLES, ROLE_PROFILE_MODEL } = require('../../src/utils/constants');

/**
 * Fixture builders for the integration suite.
 *
 * These write through the **models**, not the services. That is deliberate: a
 * test for the bed service should fail when the bed service breaks, not when
 * registration breaks. Building the world through the API under test makes every
 * failure ambiguous and every suite an integration test of the whole app.
 *
 * Two conventions worth knowing:
 *
 *  - Everything takes an `overrides` object and returns the saved document, so a
 *    test states only the field it cares about.
 *  - `createActor` returns `{ user, profile, token, headers }`. Almost every
 *    request needs a bearer header, and building it by hand in each test is how
 *    a suite ends up with three slightly different auth helpers.
 */

let sequence = 0;
/** Monotonic within a file — unique emails and employee ids without collisions. */
const unique = (prefix) => `${prefix}-${Date.now().toString(36)}-${(sequence += 1)}`;

const DEFAULT_PASSWORD = 'Password123!';

async function createUser(overrides = {}) {
  const role = overrides.role || ROLES.PATIENT;
  return User.create({
    name: overrides.name || `Test ${role}`,
    email: overrides.email || `${unique(role)}@hospital.test`,
    password: overrides.password || DEFAULT_PASSWORD,
    role,
    ...overrides,
  });
}

async function createPatientProfile(user, overrides = {}) {
  return Patient.create({
    user: user._id,
    age: 42,
    gender: 'other',
    emergencyContact: {
      name: 'Next Of Kin',
      relationship: 'sibling',
      phone: '+15550001111',
    },
    ...overrides,
  });
}

async function createDoctorProfile(user, overrides = {}) {
  return Doctor.create({
    user: user._id,
    employeeId: unique('DOC').toUpperCase(),
    specialization: 'general_medicine',
    qualifications: 'MBBS',
    ...overrides,
  });
}

async function createNurseProfile(user, overrides = {}) {
  return Nurse.create({
    user: user._id,
    employeeId: unique('NUR').toUpperCase(),
    qualifications: 'RN',
    ...overrides,
  });
}

async function createStaffProfile(user, overrides = {}) {
  return Staff.create({
    user: user._id,
    employeeId: unique('EMP').toUpperCase(),
    designation: 'Coordinator',
    role: user.role,
    ...overrides,
  });
}

const PROFILE_BUILDERS = {
  Patient: createPatientProfile,
  Doctor: createDoctorProfile,
  Nurse: createNurseProfile,
  Staff: createStaffProfile,
};

/**
 * A logged-in user of any role, with the profile that role requires.
 *
 * @param {string} role one of `ROLES`
 * @param {object} [options]
 * @param {object} [options.user]    overrides for the `User` document
 * @param {object} [options.profile] overrides for the profile document
 * @returns {Promise<{user: object, profile: object, token: string, headers: object}>}
 */
async function createActor(role = ROLES.PATIENT, { user: userOverrides = {}, profile = {} } = {}) {
  const user = await createUser({ ...userOverrides, role });
  const build = PROFILE_BUILDERS[ROLE_PROFILE_MODEL[role]];
  const profileDoc = build ? await build(user, profile) : null;

  const { accessToken } = tokenService.issueTokens(user);
  return {
    user,
    profile: profileDoc,
    token: accessToken,
    headers: { Authorization: `Bearer ${accessToken}` },
  };
}

/**
 * A patient admitted to a ward, wired to a care team.
 *
 * Care-team membership is the hinge every clinical authorisation test turns on,
 * so it is built here rather than being re-assembled — and subtly differently —
 * in each test file.
 */
async function createAdmittedPatient({ doctor, nurses = [], ward = 'ICU', bed } = {}) {
  const account = await createActor(ROLES.PATIENT, {
    profile: {
      ward,
      isAdmitted: true,
      admittedAt: new Date(),
      ...(bed ? { bed: bed._id } : {}),
      ...(doctor ? { primaryDoctor: doctor.user._id } : {}),
      assignedNurses: nurses.map((n) => n.user._id),
    },
  });
  return account;
}

async function createBed(overrides = {}) {
  return Bed.create({
    bedNumber: unique('BED').toUpperCase(),
    ward: 'ICU',
    type: 'icu',
    ...overrides,
  });
}

module.exports = {
  DEFAULT_PASSWORD,
  unique,
  createUser,
  createActor,
  createPatientProfile,
  createDoctorProfile,
  createNurseProfile,
  createStaffProfile,
  createAdmittedPatient,
  createBed,
};

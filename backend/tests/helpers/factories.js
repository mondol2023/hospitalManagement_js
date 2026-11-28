'use strict';

const { User, Patient, Doctor, Nurse, Staff, Bed, Department } = require('../../src/models');
const tokenService = require('../../src/services/tokenService');
const context = require('../../src/utils/context');
const { ROLES, ROLE_PROFILE_MODEL } = require('../../src/utils/constants');
const { TEST_BRANCH_ID } = require('./tenant');

/**
 * Fixture builders for the integration suite.
 *
 * These write through the **models**, not the services. That is deliberate: a
 * test for the bed service should fail when the bed service breaks, not when
 * registration breaks. Building the world through the API under test makes every
 * failure ambiguous and every suite an integration test of the whole app.
 *
 * Conventions worth knowing:
 *
 *  - Everything takes an `overrides` object and returns the saved document, so a
 *    test states only the field it cares about.
 *  - Every builder accepts `{ tenant }` (from `makeTenant`); without it the
 *    default test tenant is used.
 *  - `createActor` returns `{ user, profile, token, headers }`. Almost every
 *    request needs a bearer header, and building it by hand in each test is how
 *    a suite ends up with three slightly different auth helpers.
 */

let sequence = 0;
/** Monotonic within a file — unique emails and employee ids without collisions. */
const unique = (prefix) => `${prefix}-${Date.now().toString(36)}-${(sequence += 1)}`;

const DEFAULT_PASSWORD = 'Password123!';

/** Runs `fn` inside the tenant's store; with no tenant the test default applies. */
const inTenant = (tenant, fn) => (tenant ? context.run(tenant.store, fn) : fn());
const branchIdOf = (tenant) => tenant?.branch?._id ?? tenant?.store?.branchId ?? TEST_BRANCH_ID;

/** Department by name in the tenant's branch; created on first use. */
async function ensureDepartment(name, { tenant } = {}) {
  return inTenant(tenant, async () => {
    const branch = branchIdOf(tenant);
    const found = await Department.findOne({ branch, name });
    if (found) return found;
    const code = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'DEPT';
    return Department.create({ branch, name, code });
  });
}

/** Swaps a department/ward name for its id, creating the department if needed. */
async function withDept(overrides, field, tenant) {
  if (typeof overrides[field] !== 'string') return overrides;
  return { ...overrides, [field]: (await ensureDepartment(overrides[field], { tenant }))._id };
}

async function createUser({ tenant, ...overrides } = {}) {
  const role = overrides.role || ROLES.PATIENT;
  const branch = branchIdOf(tenant);
  return inTenant(tenant, () =>
    User.create({
      name: overrides.name || `Test ${role}`,
      email: overrides.email || `${unique(role)}@hospital.test`,
      password: overrides.password || DEFAULT_PASSWORD,
      role,
      branches: [branch],
      defaultBranch: branch,
      ...overrides,
    })
  );
}

async function createPatientProfile(user, { tenant, ...overrides } = {}) {
  return inTenant(tenant, () =>
    Patient.create({
      user: user._id,
      age: 42,
      gender: 'other',
      emergencyContact: {
        name: 'Next Of Kin',
        relationship: 'sibling',
        phone: '+15550001111',
      },
      registeredAtBranch: branchIdOf(tenant),
      ...overrides,
    })
  );
}

async function createDoctorProfile(user, { tenant, ...raw } = {}) {
  const overrides = await withDept(raw, 'department', tenant);
  return inTenant(tenant, () =>
    Doctor.create({
      user: user._id,
      employeeId: unique('DOC').toUpperCase(),
      specialization: 'general_medicine',
      qualifications: 'MBBS',
      ...overrides,
    })
  );
}

async function createNurseProfile(user, { tenant, ...raw } = {}) {
  const overrides = await withDept(raw, 'department', tenant);
  return inTenant(tenant, () =>
    Nurse.create({
      user: user._id,
      employeeId: unique('NUR').toUpperCase(),
      qualifications: 'RN',
      ...overrides,
    })
  );
}

async function createStaffProfile(user, { tenant, ...raw } = {}) {
  const overrides = await withDept(raw, 'department', tenant);
  return inTenant(tenant, () =>
    Staff.create({
      user: user._id,
      employeeId: unique('EMP').toUpperCase(),
      designation: 'Coordinator',
      role: user.role,
      ...overrides,
    })
  );
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
 * @param {object} [options.tenant]  tenant from `makeTenant`; default test tenant otherwise
 * @returns {Promise<{user: object, profile: object, token: string, headers: object}>}
 */
async function createActor(
  role = ROLES.PATIENT,
  { user: userOverrides = {}, profile = {}, tenant } = {}
) {
  const user = await createUser({ ...userOverrides, role, tenant });
  const build = PROFILE_BUILDERS[ROLE_PROFILE_MODEL[role]];
  const profileDoc = build ? await build(user, { ...profile, tenant }) : null;

  const { accessToken } = tokenService.issueTokens(user, { branchId: branchIdOf(tenant) });
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
async function createAdmittedPatient({ doctor, nurses = [], ward = 'ICU', bed, tenant } = {}) {
  return createActor(ROLES.PATIENT, {
    tenant,
    profile: {
      ward,
      isAdmitted: true,
      admittedAt: new Date(),
      admittedBranch: branchIdOf(tenant),
      ...(bed ? { bed: bed._id } : {}),
      ...(doctor ? { primaryDoctor: doctor.user._id } : {}),
      assignedNurses: nurses.map((n) => n.user._id),
    },
  });
}

async function createBed({ tenant, ...raw } = {}) {
  const overrides = await withDept({ ward: 'ICU', ...raw }, 'ward', tenant);
  return inTenant(tenant, () =>
    Bed.create({
      bedNumber: unique('BED').toUpperCase(),
      type: 'icu',
      ...overrides,
    })
  );
}

module.exports = {
  DEFAULT_PASSWORD,
  unique,
  inTenant,
  createUser,
  createActor,
  createPatientProfile,
  createDoctorProfile,
  createNurseProfile,
  createStaffProfile,
  createAdmittedPatient,
  createBed,
  ensureDepartment,
};

'use strict';

const {
  isAdmin,
  isStaff,
  isClinician,
  isSelf,
  careTeamIds,
  isCareTeamMember,
  canViewPatient,
  canReadCareData,
  canWriteCareData,
  canJoinConversation,
  assertRole,
  toId,
} = require('../../src/utils/accessPolicy');

const {
  ROLES,
  ROLE_VALUES,
  STAFF_ROLES,
  CONVERSATION_TYPE,
} = require('../../src/utils/constants');

/**
 * The access policy, tested directly.
 *
 * Every other test in this repository reaches these predicates through HTTP, and
 * an HTTP test can only show that *some* rule refused the request. That is the
 * wrong instrument for a boundary whose failure mode is silent over-permission:
 * a policy that says yes too often still returns 200, and a suite built on happy
 * paths applauds. So this file enumerates roles instead of sampling them —
 * `ROLE_VALUES` is iterated wherever a rule is role-shaped, which means adding a
 * ninth role to `constants.js` fails here until someone states where it lands.
 *
 * The functions take already-loaded documents and return booleans. No database,
 * no request, no mocks — the fixtures are object literals.
 */

const actor = (role, id = 'actor-1') => ({ id, role });
const patientDoc = (overrides = {}) => ({
  user: 'patient-user',
  ward: 'ICU',
  primaryDoctor: 'doctor-1',
  assignedNurses: ['nurse-1', 'nurse-2'],
  ...overrides,
});

describe('accessPolicy — identity coercion', () => {
  it('reduces the three shapes an id arrives in to one string', () => {
    expect(toId('abc')).toBe('abc');
    expect(toId({ _id: 'abc' })).toBe('abc');
    // Populated documents and raw ObjectIds both stringify.
    expect(toId({ toString: () => 'abc' })).toBe('abc');
  });

  it('treats every absent value as absent rather than as the string "undefined"', () => {
    // This is the whole reason the helper exists: `String(undefined)` is a
    // perfectly good map key, so a missing id would silently equal another
    // missing id and two unrelated strangers would match.
    expect(toId(undefined)).toBeNull();
    expect(toId(null)).toBeNull();
    expect(toId('')).toBeNull();
  });
});

describe('accessPolicy — role tiers', () => {
  it('counts every employee as staff and the patient as not', () => {
    for (const role of ROLE_VALUES) {
      expect(isStaff(role)).toBe(role !== ROLES.PATIENT && role !== ROLES.PLATFORM_ADMIN);
    }
  });

  it('limits the clinical tier to the two roles that touch patients', () => {
    for (const role of ROLE_VALUES) {
      expect(isClinician(role)).toBe(role === ROLES.DOCTOR || role === ROLES.NURSE);
    }
  });

  it('limits the administrative tier to admin and manager', () => {
    for (const role of ROLE_VALUES) {
      expect(isAdmin(role)).toBe(role === ROLES.ADMIN || role === ROLES.MANAGER);
    }
  });

  it('refuses roles it has never heard of', () => {
    for (const unknown of ['superuser', 'root', '', 'Admin', undefined]) {
      expect(isStaff(unknown)).toBe(false);
      expect(isAdmin(unknown)).toBe(false);
      expect(isClinician(unknown)).toBe(false);
    }
  });
});

describe('accessPolicy — is this my own record', () => {
  it('matches the patient profile back to the account that owns it', () => {
    expect(isSelf({ id: 'patient-user', role: ROLES.PATIENT }, patientDoc())).toBe(true);
    // Hydrated actors carry `_id`, lean ones carry `id`; both are the same person.
    expect(isSelf({ _id: 'patient-user' }, patientDoc())).toBe(true);
  });

  it('does not match a different patient', () => {
    expect(isSelf(actor(ROLES.PATIENT, 'someone-else'), patientDoc())).toBe(false);
  });

  it('does not match when either side is missing', () => {
    expect(isSelf(null, patientDoc())).toBe(false);
    expect(isSelf(actor(ROLES.PATIENT), null)).toBe(false);
    // An orphaned profile with no `user` must not match an actor with no id.
    expect(isSelf({ role: ROLES.PATIENT }, patientDoc({ user: null }))).toBe(false);
  });
});

describe('accessPolicy — the care team', () => {
  it('is the primary doctor plus the assigned nurses', () => {
    expect(careTeamIds(patientDoc())).toEqual(['doctor-1', 'nurse-1', 'nurse-2']);
  });

  it('survives a patient who is only half admitted', () => {
    expect(careTeamIds(patientDoc({ primaryDoctor: null }))).toEqual(['nurse-1', 'nurse-2']);
    expect(careTeamIds(patientDoc({ assignedNurses: undefined }))).toEqual(['doctor-1']);
    expect(careTeamIds(patientDoc({ primaryDoctor: null, assignedNurses: [] }))).toEqual([]);
    expect(careTeamIds(null)).toEqual([]);
  });

  it('recognises members by either id shape', () => {
    expect(isCareTeamMember({ id: 'nurse-2', role: ROLES.NURSE }, patientDoc())).toBe(true);
    expect(isCareTeamMember({ _id: 'doctor-1', role: ROLES.DOCTOR }, patientDoc())).toBe(true);
    expect(isCareTeamMember(actor(ROLES.DOCTOR, 'doctor-9'), patientDoc())).toBe(false);
    expect(isCareTeamMember(null, patientDoc())).toBe(false);
  });
});

describe('accessPolicy — demographics', () => {
  it('is open to every employee, assigned or not', () => {
    for (const role of STAFF_ROLES) {
      // A receptionist cannot book for someone they may not look up.
      expect(canViewPatient(actor(role, 'stranger'), patientDoc())).toBe(true);
    }
  });

  it('lets a patient see their own record and nobody else’s', () => {
    expect(canViewPatient(actor(ROLES.PATIENT, 'patient-user'), patientDoc())).toBe(true);
    expect(canViewPatient(actor(ROLES.PATIENT, 'other-patient'), patientDoc())).toBe(false);
  });

  it('refuses an unauthenticated caller', () => {
    expect(canViewPatient(null, patientDoc())).toBe(false);
  });
});

describe('accessPolicy — clinical reads', () => {
  it('admits clinicians and administrators only', () => {
    const permitted = [ROLES.DOCTOR, ROLES.NURSE, ROLES.ADMIN, ROLES.MANAGER];
    for (const role of ROLE_VALUES) {
      expect(canReadCareData(actor(role))).toBe(permitted.includes(role));
    }
  });

  it('excludes staff whose job never involves the chart', () => {
    // Being an employee is not a clinical qualification: an accountant billing
    // the stay has no business reading the observations behind it.
    expect(canReadCareData(actor(ROLES.ACCOUNTANT))).toBe(false);
    expect(canReadCareData(actor(ROLES.PHARMACIST))).toBe(false);
    expect(canReadCareData(actor(ROLES.RECEPTIONIST))).toBe(false);
  });

  it('excludes the patient from their own nursing feed', () => {
    // Deliberate, and the one rule here most likely to be "fixed" by mistake:
    // the care log is a staff channel. Patients read a curated record instead.
    expect(canReadCareData({ id: 'patient-user', role: ROLES.PATIENT })).toBe(false);
    expect(canReadCareData(null)).toBe(false);
  });
});

describe('accessPolicy — clinical writes', () => {
  const patient = patientDoc();

  it('admits the care team', () => {
    expect(canWriteCareData({ actor: actor(ROLES.DOCTOR, 'doctor-1'), patient })).toBe(true);
    expect(canWriteCareData({ actor: actor(ROLES.NURSE, 'nurse-1'), patient })).toBe(true);
  });

  it('admits administrators without an assignment', () => {
    expect(canWriteCareData({ actor: actor(ROLES.ADMIN, 'nobody'), patient })).toBe(true);
  });

  it('refuses a clinician who is on somebody else’s team', () => {
    // Ward coverage does not apply to doctors: a doctor writes on their own
    // patients, and `wards` is not consulted for that role.
    expect(canWriteCareData({ actor: actor(ROLES.DOCTOR, 'doctor-9'), patient })).toBe(false);
    expect(
      canWriteCareData({ actor: actor(ROLES.DOCTOR, 'doctor-9'), patient, wards: ['ICU'] })
    ).toBe(false);
  });

  it('admits a nurse whose ward covers the bed', () => {
    // The roster lags reality. A nurse on the ward must be able to chart the
    // dose she just gave without waiting to be formally assigned.
    expect(
      canWriteCareData({ actor: actor(ROLES.NURSE, 'nurse-9'), patient, wards: ['ICU', 'ER'] })
    ).toBe(true);
  });

  it('reads an empty ward list as a float nurse rather than as no wards', () => {
    expect(canWriteCareData({ actor: actor(ROLES.NURSE, 'nurse-9'), patient, wards: [] })).toBe(
      true
    );
  });

  it('refuses a nurse from another ward', () => {
    expect(
      canWriteCareData({ actor: actor(ROLES.NURSE, 'nurse-9'), patient, wards: ['Maternity'] })
    ).toBe(false);
  });

  it('refuses ward coverage when the caller never claimed any', () => {
    // `undefined` means the caller did not load a nurse profile at all, which is
    // not the same as loading one with no restrictions.
    expect(canWriteCareData({ actor: actor(ROLES.NURSE, 'nurse-9'), patient })).toBe(false);
  });

  it('refuses ward coverage for a patient who is not on a ward', () => {
    const outpatient = patientDoc({ ward: null });
    expect(
      canWriteCareData({ actor: actor(ROLES.NURSE, 'nurse-9'), patient: outpatient, wards: ['ICU'] })
    ).toBe(false);
  });

  it('refuses non-clinical staff and patients outright', () => {
    for (const role of [ROLES.RECEPTIONIST, ROLES.PHARMACIST, ROLES.ACCOUNTANT, ROLES.PATIENT]) {
      expect(canWriteCareData({ actor: actor(role, 'patient-user'), patient, wards: [] })).toBe(
        false
      );
    }
  });

  it('refuses when either the actor or the patient is missing', () => {
    expect(canWriteCareData({ actor: null, patient })).toBe(false);
    expect(canWriteCareData({ actor: actor(ROLES.ADMIN), patient: null })).toBe(false);
    expect(canWriteCareData({})).toBe(false);
  });
});

describe('accessPolicy — which conversations a role may join', () => {
  const types = Object.values(CONVERSATION_TYPE);

  it('confines patients to the care-team channel', () => {
    for (const type of types) {
      expect(canJoinConversation(ROLES.PATIENT, type)).toBe(type === CONVERSATION_TYPE.CARE_TEAM);
    }
  });

  it('lets every employee into every channel kind', () => {
    for (const role of STAFF_ROLES) {
      for (const type of types) {
        expect(canJoinConversation(role, type)).toBe(true);
      }
    }
  });

  it('refuses an unknown role and an unknown channel kind', () => {
    expect(canJoinConversation('intruder', CONVERSATION_TYPE.STAFF_ONLY)).toBe(false);
    expect(canJoinConversation(ROLES.PATIENT, 'staff_only ')).toBe(false);
    expect(canJoinConversation(ROLES.PATIENT, undefined)).toBe(false);
  });
});

describe('accessPolicy — assertRole', () => {
  const allowed = [ROLES.ADMIN, ROLES.PHARMACIST];

  it('passes a listed role and refuses everyone else with the given message', () => {
    expect(() => assertRole(actor(ROLES.PHARMACIST), allowed, 'Pharmacy only')).not.toThrow();
    for (const role of ROLE_VALUES.filter((r) => !allowed.includes(r))) {
      expect(() => assertRole(actor(role), allowed, 'Pharmacy only')).toThrow('Pharmacy only');
    }
  });

  it('refuses a missing actor with a 403', () => {
    expect.assertions(2);
    try {
      assertRole(undefined, allowed, 'Pharmacy only');
    } catch (error) {
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Pharmacy only');
    }
  });
});

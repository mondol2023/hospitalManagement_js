'use strict';

const {
  ROLES,
  STAFF_ROLES,
  CLINICAL_ROLES,
  ADMIN_ROLES,
  PATIENT_VISIBLE_CONVERSATIONS,
} = require('./constants');

/**
 * Who may see and touch a patient's data.
 *
 * These are pure predicates over already-loaded documents — no database, no
 * request object — so the middleware, the services and the socket gateway all
 * enforce the *same* rule instead of three similar-looking ones. It also makes
 * the boundary directly unit-testable, which matters more here than anywhere
 * else in the codebase.
 *
 * The tiers, from the requirement "only hospital staff, nurses and doctors see
 * the info, and can do treatment from there":
 *
 *  - **Demographics** (name, MRN, ward, bed): any employee. A receptionist
 *    cannot book an appointment for someone they are not allowed to look up.
 *  - **Clinical reads** (vitals, medication chart, care logs, records):
 *    clinicians and administrators only. A pharmacist or accountant is staff but
 *    has no business reading a patient's observations, and a patient never reads
 *    the nursing feed — it is a staff channel by design.
 *  - **Clinical writes** (administering a dose, logging a service, charting):
 *    the care team, plus any nurse whose ward covers the patient. Assignment is
 *    the norm; ward coverage is what stops a genuine bedside event from going
 *    unrecorded because the roster had not caught up.
 */

const toId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value._id) return String(value._id);
  return String(value);
};

function isAdmin(role) {
  return ADMIN_ROLES.includes(role);
}

function isStaff(role) {
  return STAFF_ROLES.includes(role);
}

function isClinician(role) {
  return CLINICAL_ROLES.includes(role);
}

/** True when the actor *is* the patient whose record this is. */
function isSelf(actor, patient) {
  if (!actor || !patient) return false;
  return toId(actor.id || actor._id) === toId(patient.user);
}

/**
 * @param {object} patient patient document, lean or hydrated
 * @returns {string[]} user ids of the assigned doctor and nurses
 */
function careTeamIds(patient) {
  if (!patient) return [];
  const nurses = Array.isArray(patient.assignedNurses) ? patient.assignedNurses : [];
  return [patient.primaryDoctor, ...nurses].filter(Boolean).map(toId);
}

function isCareTeamMember(actor, patient) {
  if (!actor) return false;
  return careTeamIds(patient).includes(toId(actor.id || actor._id));
}

/** Demographic tier. */
function canViewPatient(actor, patient) {
  if (!actor) return false;
  return isStaff(actor.role) || isSelf(actor, patient);
}

/** Clinical read tier — deliberately excludes the patient themself. */
function canReadCareData(actor) {
  if (!actor) return false;
  return isAdmin(actor.role) || isClinician(actor.role);
}

/**
 * Clinical write tier.
 *
 * @param {object} args
 * @param {object} args.actor    `req.user`
 * @param {object} args.patient  the patient document
 * @param {string[]} [args.wards] wards the actor covers when they are a nurse;
 *   an empty array means "float nurse — every ward", `undefined` means the actor
 *   is not a nurse and coverage does not apply
 */
function canWriteCareData({ actor, patient, wards }) {
  if (!actor || !patient) return false;
  if (isAdmin(actor.role)) return true;
  if (isCareTeamMember(actor, patient)) return true;

  if (actor.role === ROLES.NURSE && Array.isArray(wards)) {
    // No ward restriction on the profile = float nurse, authorised everywhere.
    if (!wards.length) return true;
    return Boolean(patient.ward) && wards.map(String).includes(String(patient.ward));
  }
  return false;
}

/**
 * Patients may only ever participate in care-team conversations; every other
 * thread kind is staff-walled. Enforced again in `chatService`, because a policy
 * that only the route layer applies is one refactor away from being skipped.
 */
function canJoinConversation(role, conversationType) {
  if (role === ROLES.PATIENT) return PATIENT_VISIBLE_CONVERSATIONS.includes(conversationType);
  return isStaff(role);
}

module.exports = {
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
  toId,
};

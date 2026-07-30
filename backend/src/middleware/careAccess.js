'use strict';

const mongoose = require('mongoose');

const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const accessPolicy = require('../utils/accessPolicy');
const patientRepository = require('../repositories/patientRepository');
const nurseService = require('../services/nurseService');
const { ROLES } = require('../utils/constants');

/**
 * Row-level access to one patient.
 *
 * This is the middleware form of the requirement "only hospital staff, nurses
 * and doctors see the info and can do treatment from there". `authorize` can
 * only say *doctors may chart*; it cannot say *this* doctor may chart *this*
 * patient. That second question needs the patient document, so it needs a
 * database read, so it lives here rather than in a role list.
 *
 * The predicates themselves are in `utils/accessPolicy` and are pure. This file
 * does the three things a policy function cannot: resolve the route parameter
 * into a document, look up a nurse's ward coverage, and translate a `false` into
 * the right HTTP status.
 *
 * Loading the patient once and hanging it on `req.patient` also means the
 * controller does not re-fetch it — the alternative is two reads of the same
 * document on every bedside write, which at ward-round volume is not free.
 *
 * None of this replaces the checks inside the services. A service that trusts
 * its caller is one internal call away from being wrong, and these rules are the
 * ones where being wrong means a stranger reads someone's medication chart.
 */

const SELF_ALIAS = 'me';

function readParam(req, param, source) {
  const bag = source === 'body' ? req.body : source === 'query' ? req.query : req.params;
  return bag ? bag[param] : undefined;
}

/**
 * Resolves a route parameter into `req.patient`.
 *
 * `:patientId` may be the literal `me`, which resolves through the actor's own
 * user id. Patients do not know their patient-profile id and should not have to
 * discover it just to read their own chart.
 *
 * @param {object} [options]
 * @param {string} [options.param='patientId']
 * @param {'params'|'body'|'query'} [options.source='params']
 * @param {boolean} [options.optional=false] pass through when the parameter is
 *   absent — for endpoints where a patient filter is one of several
 * @param {object} [options.deps] injection seam for tests
 */
function loadPatient({ param = 'patientId', source = 'params', optional = false, deps = {} } = {}) {
  const patients = deps.patients || patientRepository;

  return asyncHandler(async (req, res, next) => {
    const raw = readParam(req, param, source);

    if (raw === undefined || raw === null || raw === '') {
      if (optional) return next();
      throw ApiError.badRequest(`${param} is required`);
    }

    let patient;
    if (String(raw) === SELF_ALIAS) {
      if (!req.user) throw ApiError.unauthorized('Authentication required');
      patient = await patients.findByUser(req.user.id);
      if (!patient) throw ApiError.notFound('Patient profile');
    } else {
      // Guarded explicitly: an unparseable id would otherwise surface as a
      // Mongoose CastError, and "invalid id" is a 400, not a 500.
      if (!mongoose.Types.ObjectId.isValid(String(raw))) {
        throw ApiError.badRequest(`${param} is not a valid id`);
      }
      patient = await patients.findById(raw);
      if (!patient) throw ApiError.notFound('Patient');
    }

    req.patient = patient;
    return next();
  });
}

/** @private the patient must already be on the request; if not, that is a wiring bug. */
function requireLoadedPatient(req) {
  if (!req.patient) {
    throw ApiError.internal('Patient was not loaded before an access check', {
      code: 'MIDDLEWARE_ORDER',
    });
  }
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required', { code: 'TOKEN_MISSING' });
  }
  return req.patient;
}

/**
 * Demographic tier: any employee, or the patient themself.
 *
 * Wide on purpose — a receptionist who cannot look a patient up cannot book them
 * an appointment. It says nothing about clinical content.
 */
const requirePatientView = asyncHandler(async (req, res, next) => {
  const patient = requireLoadedPatient(req);
  if (!accessPolicy.canViewPatient(req.user, patient)) {
    throw ApiError.forbidden('You do not have access to this patient');
  }
  next();
});

/**
 * Clinical read tier: clinicians and administrators.
 *
 * Deliberately excludes the patient themself. The nursing feed — doses given,
 * services performed, observations — is a staff channel by requirement, and an
 * accountant or pharmacist is staff but has no business in it.
 */
const requireCareRead = asyncHandler(async (req, res, next) => {
  requireLoadedPatient(req);
  if (!accessPolicy.canReadCareData(req.user)) {
    throw ApiError.forbidden('This clinical information is restricted to the care team');
  }
  next();
});

/**
 * Clinical write tier: the care team, plus any nurse whose ward covers the
 * patient.
 *
 * Ward coverage is what stops a real bedside event from going unrecorded because
 * the roster had not caught up — the nurse who actually gave the dose can chart
 * it. It is fetched only for nurses, so no other role pays for the lookup.
 *
 * The resolved coverage is left on `req.wardCoverage` so a service that needs
 * the same answer does not query for it a second time.
 */
function createRequireCareWrite(deps = {}) {
  const nurses = deps.nurses || nurseService;

  return asyncHandler(async (req, res, next) => {
    const patient = requireLoadedPatient(req);

    // `undefined` (not `[]`) is the policy's signal for "coverage does not
    // apply". An empty array means float nurse — authorised everywhere — so the
    // two must not be collapsed.
    const wards =
      req.user.role === ROLES.NURSE ? await nurses.coveredWards(req.user.id) : undefined;
    req.wardCoverage = wards;

    if (!accessPolicy.canWriteCareData({ actor: req.user, patient, wards })) {
      throw ApiError.forbidden('You are not on this patient’s care team');
    }
    next();
  });
}

const requireCareWrite = createRequireCareWrite();

module.exports = {
  loadPatient,
  requirePatientView,
  requireCareRead,
  requireCareWrite,
  createRequireCareWrite,
};

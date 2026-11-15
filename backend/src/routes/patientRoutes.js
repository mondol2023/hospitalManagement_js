'use strict';

const express = require('express');

const {
  authenticate,
  authorize,
  requireStaff,
  loadPatient,
  requirePatientView,
  requireCareWrite,
  uploadLimiter,
  singleImage,
  validate,
} = require('../middleware');
const { ROLES } = require('../utils/constants');
const schemas = require('../validators/patient');
const controller = require('../controllers/patientController');

/**
 * Three tiers of access show up directly in the middleware chains:
 *
 *  - **Demographics** — `requireStaff`, or the patient themself on `/me`.
 *  - **Chart edits** — `requireCareWrite`: the care team, plus a nurse whose
 *    ward covers the patient.
 *  - **Care-team composition and discharge** — doctors and administrators.
 *    These are deliberately *not* behind `requireCareWrite`: the doctor
 *    arranging cover for a patient is frequently not yet on that patient's team,
 *    and requiring membership to grant membership is a deadlock.
 *
 * `/me` is declared before `/:patientId` so it is never swallowed by the
 * parameterised route.
 */
const router = express.Router();

router.use(authenticate);

router.get('/me', controller.me);
router.patch('/me', validate(schemas.updateOwn), controller.updateOwn);
router.put('/me/avatar', uploadLimiter, singleImage(), controller.uploadAvatar);

router.get('/', requireStaff, validate(schemas.list), controller.list);
router.get('/caseload', authorize(ROLES.NURSE), validate(schemas.caseload), controller.caseload);
router.get('/ward/:ward', requireStaff, validate(schemas.ward), controller.ward);
router.get('/mrn/:mrn', requireStaff, validate(schemas.byMrn), controller.byMrn);

router.get('/:patientId', validate(schemas.byId), controller.getById);

router.patch(
  '/:patientId/clinical',
  validate(schemas.updateClinical),
  loadPatient(),
  requireCareWrite,
  controller.updateClinical
);

const careTeamAdmin = [
  authorize(ROLES.DOCTOR, ROLES.ADMIN, ROLES.MANAGER),
  loadPatient(),
  requirePatientView,
];

router.get('/:patientId/care-team', validate(schemas.byId), ...careTeamAdmin, controller.careTeam);

router.post(
  '/:patientId/nurses',
  validate(schemas.assignNurses),
  ...careTeamAdmin,
  controller.assignNurses
);

router.delete(
  '/:patientId/nurses/:nurseUserId',
  validate(schemas.unassignNurse),
  ...careTeamAdmin,
  controller.unassignNurse
);

router.patch(
  '/:patientId/primary-doctor',
  validate(schemas.setPrimaryDoctor),
  ...careTeamAdmin,
  controller.setPrimaryDoctor
);

router.post(
  '/:patientId/discharge',
  validate(schemas.discharge),
  ...careTeamAdmin,
  controller.discharge
);

module.exports = router;

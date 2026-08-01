'use strict';

const express = require('express');

const {
  authenticate,
  authorize,
  requireAdmin,
  requireClinician,
  loadPatient,
  reportLimiter,
  validate,
} = require('../middleware');
const { ROLES } = require('../utils/constants');
const schemas = require('../validators/medicalRecord');
const controller = require('../controllers/medicalRecordController');

/**
 * The encounter record — read by the patient it is about, written only by a
 * doctor.
 *
 * The read routes carry no role gate because the rule is not a role: the
 * patient may read their own, and everyone else needs the clinical tier, which
 * `medicalRecordService._assertCanRead` decides once for HTTP and sockets alike.
 * A receptionist is staff and still gets nothing here.
 *
 * Writing is `ROLES.DOCTOR` and nothing else. A nurse's contribution to the
 * chart is the care log; blurring the two would make it impossible to say who
 * signed a diagnosis — and a discharge summary or an insurance claim is built
 * from exactly that signature. Amendment narrows further to the *authoring*
 * doctor, enforced in the service, and deletion is administrative: it exists for
 * a record filed against the wrong patient, not for a change of clinical mind.
 */
const router = express.Router();

router.use(authenticate);

const doctorOnly = authorize(ROLES.DOCTOR);

// Fixed segments before `/:id`.
router.get('/me', doctorOnly, validate(schemas.myRecords), controller.myRecords);

router.get(
  '/follow-ups',
  requireClinician,
  validate(schemas.followUps),
  controller.followUpsDue
);
router.post(
  '/follow-ups/remind',
  requireAdmin,
  reportLimiter,
  validate(schemas.followUps),
  controller.sendFollowUpReminders
);

router.get(
  '/patient/:patientId',
  validate(schemas.chart),
  loadPatient(),
  controller.chart
);
router.get(
  '/patient/:patientId/latest',
  validate(schemas.latest),
  loadPatient(),
  controller.latest
);

router.get(
  '/doctor/:doctorUserId',
  requireClinician,
  validate(schemas.listForDoctor),
  controller.listForDoctor
);

router.post('/', doctorOnly, validate(schemas.create), controller.create);

router.get('/:id', validate(schemas.byId), controller.getById);
router.patch('/:id', doctorOnly, validate(schemas.update), controller.update);
router.delete('/:id', requireAdmin, validate(schemas.byId), controller.remove);

module.exports = router;

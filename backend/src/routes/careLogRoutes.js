'use strict';

const express = require('express');

const {
  authenticate,
  requireCareReader,
  loadPatient,
  requireCareWrite,
  validate,
} = require('../middleware');
const schemas = require('../validators/careLog');
const controller = require('../controllers/careLogController');

/**
 * The bedside chart is staff-only, end to end.
 *
 * `requireCareReader` on the router covers that in one place: admins and
 * clinicians pass, and a `patient` user has no read path to this collection at
 * all — not even to their own entries. That is deliberate. Raw nursing notes,
 * refused doses and escalation flags are working clinical records, and the
 * patient-facing view of their care is the medical record, not the chart.
 *
 * Writes resolve the patient from the *body* and run `requireCareWrite`, so a
 * nurse from another ward is refused before the write path opens. Each service
 * method re-checks; the middleware exists so the refusal costs one read.
 */
const router = express.Router();

router.use(authenticate, requireCareReader);

/** Loads `body.patientId` and narrows to the care team + ward-covering nurses. */
const careWrite = [loadPatient({ source: 'body', param: 'patientId' }), requireCareWrite];

// --- Writes -----------------------------------------------------------------

router.post(
  '/medications',
  validate(schemas.administerMedication),
  ...careWrite,
  controller.administerMedication
);

router.post('/vitals', validate(schemas.recordVitals), ...careWrite, controller.recordVitals);

// Services and procedures share a payload; only the entry `type` differs.
router.post('/services', validate(schemas.logService), ...careWrite, controller.logService);
router.post('/procedures', validate(schemas.logService), ...careWrite, controller.logProcedure);

router.post(
  '/observations',
  validate(schemas.logObservation),
  ...careWrite,
  controller.logObservation
);

router.post('/handovers', validate(schemas.handover), ...careWrite, controller.handover);

// --- Reads ------------------------------------------------------------------

// Fixed segments first, so `/me` and `/attention` are never read as an id.
router.get('/me', validate(schemas.myEntries), controller.myEntries);
router.get('/attention', validate(schemas.attentionQueue), controller.attentionQueue);
router.get('/ward/:ward', validate(schemas.wardFeed), controller.wardFeed);

router.get(
  '/patient/:patientId',
  validate(schemas.timeline),
  loadPatient(),
  controller.timeline
);

router.get(
  '/patient/:patientId/vitals/latest',
  validate(schemas.latestVitals),
  loadPatient(),
  controller.latestVitals
);

router.get('/:id', validate(schemas.byId), controller.getById);

// --- Amendments -------------------------------------------------------------

router.post('/:id/acknowledge', validate(schemas.acknowledge), controller.acknowledge);

/**
 * A correction supersedes rather than edits, and the patient it belongs to comes
 * from the original entry — so there is no `patientId` in the body to load from.
 * `correct()` resolves the patient itself and applies the same care-team check.
 */
router.post('/:id/correct', validate(schemas.correct), controller.correct);

module.exports = router;

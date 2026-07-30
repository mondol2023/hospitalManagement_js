'use strict';

const express = require('express');

const { authenticate, requireStaff, denyPatients, validate } = require('../middleware');
const schemas = require('../validators/appointment');
const controller = require('../controllers/appointmentController');

/**
 * Patients reach almost all of this router: booking, listing their own visits,
 * rescheduling and cancelling are all things they may do for themselves. The
 * service decides *whose* appointments they see, so no route here needs to.
 *
 * The exceptions are the outcome transitions — confirm, complete, no-show. Those
 * are clinical judgements, blocked in `transition()` as well as here; the route
 * gate exists so the refusal is a 403 at the door rather than after three
 * database reads.
 */
const router = express.Router();

router.use(authenticate);

router.post('/', validate(schemas.book), controller.book);
router.get('/', validate(schemas.listMine), controller.listMine);

router.get(
  '/patient/:patientId',
  validate(schemas.listForPatient),
  controller.listForPatient
);
router.get(
  '/doctor/:userId',
  requireStaff,
  validate(schemas.listForDoctor),
  controller.listForDoctor
);
router.get(
  '/doctor/:userId/day',
  requireStaff,
  validate(schemas.daySchedule),
  controller.daySchedule
);

router.get('/:id', validate(schemas.byId), controller.getById);
router.patch('/:id/reschedule', validate(schemas.reschedule), controller.reschedule);
router.post('/:id/cancel', validate(schemas.cancel), controller.cancel);

router.post('/:id/confirm', denyPatients, validate(schemas.byId), controller.confirm);
router.post('/:id/complete', denyPatients, validate(schemas.complete), controller.complete);
router.post('/:id/no-show', denyPatients, validate(schemas.byId), controller.markNoShow);

module.exports = router;

'use strict';

const express = require('express');

const {
  authenticate,
  authorize,
  requireStaff,
  requireCareReader,
  reportLimiter,
  validate,
} = require('../middleware');
const { ROLES } = require('../utils/constants');
const schemas = require('../validators/emergency');
const controller = require('../controllers/emergencyController');

/**
 * `POST /` carries no role gate — deliberately.
 *
 * A patient hitting the call button, a visitor, a porter: all of them can raise
 * an alert, because a system that refuses a report from the wrong account is
 * worse than one that occasionally receives a false alarm. There is no
 * per-endpoint throttle on it either; the global limiter is the only backstop,
 * and rationing crash calls to save a few writes is not a trade worth making.
 *
 * Everything after the report is staff-only, and responding — acknowledge,
 * resolve, escalate — narrows further to clinicians and site management. Site
 * management is included because a fire or security alert is theirs to own, and
 * a nurse should not have to claim one in order to close it.
 */
const router = express.Router();

router.use(authenticate);

router.post('/', validate(schemas.raise), controller.raise);

router.use(requireStaff);

const responder = authorize(ROLES.DOCTOR, ROLES.NURSE, ROLES.ADMIN, ROLES.MANAGER);

// Fixed segments before `/:id`.
router.get('/active', validate(schemas.activeBoard), controller.activeBoard);
router.get('/count', controller.countOpen);
router.get('/stats', reportLimiter, validate(schemas.responseStats), controller.responseStats);

router.get(
  '/patient/:patientId',
  requireCareReader,
  validate(schemas.listForPatient),
  controller.listForPatient
);

router.get('/', validate(schemas.list), controller.list);

router.get('/:id', validate(schemas.byId), controller.getById);
router.post('/:id/acknowledge', responder, validate(schemas.byId), controller.acknowledge);
router.post('/:id/resolve', responder, validate(schemas.resolve), controller.resolve);
router.post('/:id/escalate', responder, validate(schemas.escalate), controller.escalate);

module.exports = router;

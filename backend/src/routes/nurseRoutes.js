'use strict';

const express = require('express');

const { authenticate, authorize, requireStaff, requireAdmin, validate } = require('../middleware');
const { ROLES } = require('../utils/constants');
const schemas = require('../validators/nurse');
const controller = require('../controllers/nurseController');

/**
 * The nursing roster is staff-only in full — unlike the doctor directory, no
 * part of it is patient-facing. Who is on the floor tonight is operational
 * information, not a booking aid.
 *
 * `PATCH /:id/roster` is the one administrator-only route: `assignedWards` is
 * read directly by `canWriteCareData`, so a nurse able to edit it could grant
 * themselves charting rights over the whole hospital.
 */
const router = express.Router();

router.use(authenticate, requireStaff);

router.get('/', validate(schemas.list), controller.list);

router.get('/me', authorize(ROLES.NURSE), controller.me);
router.patch('/me', authorize(ROLES.NURSE), validate(schemas.updateOwn), controller.updateOwn);
router.patch('/me/duty', authorize(ROLES.NURSE), validate(schemas.setDuty), controller.setDuty);
router.get('/me/workload', authorize(ROLES.NURSE), controller.workload);

router.get('/ward/:ward/on-duty', validate(schemas.wardParam), controller.onDutyInWard);
router.get('/by-user/:userId', validate(schemas.byUser), controller.getByUser);

router.patch('/:id/roster', requireAdmin, validate(schemas.updateRoster), controller.updateRoster);

module.exports = router;

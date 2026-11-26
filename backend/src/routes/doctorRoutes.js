'use strict';

const express = require('express');

const { authenticate, authorize, requireAdmin, validate } = require('../middleware');
const { ROLES } = require('../utils/constants');
const schemas = require('../validators/doctor');
const controller = require('../controllers/doctorController');

/**
 * The directory and the availability calendar are open to every authenticated
 * user, patients included — a patient who cannot see a doctor's free slots
 * cannot book an appointment. Clinical writes are restricted to the doctor's
 * own profile: no route lets one doctor edit another. The one exception is
 * `PATCH /:id/employment`, where an administrator sets department, shift and
 * whether the doctor takes new patients.
 */
const router = express.Router();

router.use(authenticate);

router.get('/', validate(schemas.list), controller.list);
router.get('/specializations', controller.specializations);

router.get('/me', authorize(ROLES.DOCTOR), controller.me);
router.patch('/me', authorize(ROLES.DOCTOR), validate(schemas.updateOwn), controller.updateOwn);
router.patch('/me/duty', authorize(ROLES.DOCTOR), validate(schemas.setDuty), controller.setDuty);

router.get('/by-user/:userId', validate(schemas.byUser), controller.getByUser);
router.get(
  '/by-user/:userId/availability',
  validate(schemas.availability),
  controller.availability
);

router.patch(
  '/:id/employment',
  requireAdmin,
  validate(schemas.updateEmployment),
  controller.updateEmployment
);

router.get('/:id', validate(schemas.byId), controller.getById);

module.exports = router;

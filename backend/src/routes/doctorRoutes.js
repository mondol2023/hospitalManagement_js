'use strict';

const express = require('express');

const { authenticate, authorize, validate } = require('../middleware');
const { ROLES } = require('../utils/constants');
const schemas = require('../validators/doctor');
const controller = require('../controllers/doctorController');

/**
 * The directory and the availability calendar are open to every authenticated
 * user, patients included — a patient who cannot see a doctor's free slots
 * cannot book an appointment. Everything that *writes* is restricted to the
 * doctor's own profile: there is no route here that lets one doctor edit
 * another, because that is an account-administration action and belongs to
 * `/users`.
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

router.get('/:id', validate(schemas.byId), controller.getById);

module.exports = router;

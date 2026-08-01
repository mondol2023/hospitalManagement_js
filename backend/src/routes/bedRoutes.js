'use strict';

const express = require('express');

const { authenticate, authorize, requireStaff, requireAdmin, validate } = require('../middleware');
const { ROLES } = require('../utils/constants');
const schemas = require('../validators/bed');
const controller = require('../controllers/bedController');

/**
 * Two different jobs share this router, and they have different gates.
 *
 * **Inventory** — creating beds, editing rates, retiring them — is
 * administration, so it is admin-only.
 *
 * **Admission** — assign, transfer, release — is ward work. Nurses do it, and so
 * does the admitting desk, which is why receptionists are included: a patient
 * arriving at 3am is put in a bed by whoever is at the door. The clinical audit
 * line is only written when a clinician performs the move (`_recordBedEvent`
 * checks the role), so a clerk's admission is recorded on the bed and the
 * patient without being forged into the chart as a nursing entry.
 *
 * Everything readable here is staff-only. A bed board tells you which patient is
 * in which ward, which is exactly the kind of thing patients should not browse.
 */
const router = express.Router();

router.use(authenticate, requireStaff);

const admitting = authorize(ROLES.NURSE, ROLES.RECEPTIONIST, ROLES.ADMIN, ROLES.MANAGER);

// Fixed segments before `/:id`.
router.get('/available', validate(schemas.available), controller.available);
router.get('/occupancy', controller.occupancy);
router.get('/wards', controller.wards);

router.get('/', validate(schemas.list), controller.list);
router.post('/', requireAdmin, validate(schemas.create), controller.create);

router.post('/release', admitting, validate(schemas.release), controller.release);

router.get('/:id', validate(schemas.byId), controller.getById);
router.patch('/:id', requireAdmin, validate(schemas.update), controller.update);
router.delete('/:id', requireAdmin, validate(schemas.byId), controller.remove);

router.patch('/:id/status', admitting, validate(schemas.setStatus), controller.setStatus);
router.post('/:id/assign', admitting, validate(schemas.assign), controller.assign);
router.post('/:id/transfer', admitting, validate(schemas.transfer), controller.transfer);

module.exports = router;

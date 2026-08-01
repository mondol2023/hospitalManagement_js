'use strict';

const express = require('express');

const { authenticate, authorize, requireStaff, validate } = require('../middleware');
const { ROLES } = require('../utils/constants');
const schemas = require('../validators/medicine');
const controller = require('../controllers/medicineController');

/**
 * The catalogue is readable by any employee — a doctor prescribing needs to know
 * what is stocked, and a nurse charting a dose needs to find the batch. Changing
 * what the pharmacy holds is a narrower authority: pharmacists and management
 * only, which `medicineService._assertInventoryStaff` enforces independently.
 * Both gates exist because the service is also called from the care-log path,
 * where there is no route to guard.
 *
 * Deletion is admin-only and is checked in the service; here the route gate
 * stops the request one layer earlier.
 */
const router = express.Router();

router.use(authenticate, requireStaff);

const inventory = authorize(ROLES.PHARMACIST, ROLES.ADMIN, ROLES.MANAGER);

// Fixed segments before `/:id`.
router.get('/low-stock', inventory, controller.lowStock);
router.get('/expiring', inventory, validate(schemas.expiring), controller.expiring);
router.get('/expired', inventory, controller.expired);
router.post('/withdraw-expired', inventory, controller.withdrawExpired);

router.get('/', validate(schemas.list), controller.list);
router.post('/', inventory, validate(schemas.create), controller.create);

router.get('/:id', validate(schemas.byId), controller.getById);
router.patch('/:id', inventory, validate(schemas.update), controller.update);
router.delete('/:id', authorize(ROLES.ADMIN), validate(schemas.byId), controller.remove);

router.post('/:id/deactivate', inventory, validate(schemas.byId), controller.deactivate);
router.post('/:id/activate', inventory, validate(schemas.byId), controller.activate);

router.post('/:id/restock', inventory, validate(schemas.restock), controller.restock);
router.post('/:id/dispense', inventory, validate(schemas.dispense), controller.dispense);
router.post('/:id/adjust', inventory, validate(schemas.adjust), controller.adjust);

module.exports = router;

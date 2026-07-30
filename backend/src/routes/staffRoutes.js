'use strict';

const express = require('express');

const { authenticate, requireStaff, requireAdmin, validate } = require('../middleware');
const schemas = require('../validators/staff');
const controller = require('../controllers/staffController');

/**
 * Employment terms — `salaryCents` above all — are behind `requireAdmin`, and
 * the directory listing never projects them. `/me` reaches only the caller's own
 * profile, so the self-service and administrative paths cannot be confused for
 * one another.
 */
const router = express.Router();

router.use(authenticate, requireStaff);

router.get('/', validate(schemas.list), controller.list);

router.get('/me', controller.me);
router.patch('/me', validate(schemas.updateOwn), controller.updateOwn);
router.patch('/me/duty', validate(schemas.setDuty), controller.setDuty);
router.get('/me/reports', controller.myReports);

router.get('/by-user/:userId', validate(schemas.byUser), controller.getByUser);

router.patch(
  '/:id/employment',
  requireAdmin,
  validate(schemas.updateEmployment),
  controller.updateEmployment
);

module.exports = router;

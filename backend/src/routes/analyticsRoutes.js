'use strict';

const express = require('express');

const {
  authenticate,
  requireStaff,
  requireAdmin,
  reportLimiter,
  validate,
} = require('../middleware');
const schemas = require('../validators/analytics');
const controller = require('../controllers/analyticsController');

/**
 * Reporting is staff-only, and money is filtered out below that: the service
 * drops the financial metrics for anyone outside finance rather than refusing
 * the whole board, so a ward sister gets occupancy and admissions from the same
 * endpoint an accountant uses.
 *
 * `reportLimiter` sits on the aggregate reads because a wall-mounted board on a
 * polling interval is the expected client, and the short server-side cache only
 * helps once the request has already arrived. Writing — forcing a rollup,
 * recording a point, purging history — is administrative.
 */
const router = express.Router();

router.use(authenticate, requireStaff);

router.get('/catalogue', controller.catalogue);
router.get('/dashboard', reportLimiter, validate(schemas.dashboard), controller.dashboard);
router.get('/live', reportLimiter, controller.liveBoard);
router.get('/occupancy', reportLimiter, controller.wardOccupancy);
router.get('/compare', reportLimiter, validate(schemas.compare), controller.compare);
router.get('/series/:metric', reportLimiter, validate(schemas.series), controller.series);

router.post('/refresh', requireAdmin, reportLimiter, validate(schemas.refresh), controller.refresh);
router.post('/metrics', requireAdmin, validate(schemas.record), controller.record);
router.post('/purge', requireAdmin, validate(schemas.purge), controller.purge);

module.exports = router;

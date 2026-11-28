'use strict';

const express = require('express');

const { authenticatePlatform, authorize, validate } = require('../middleware');
const { ROLES } = require('../utils/constants');
const context = require('../utils/context');
const schemas = require('../validators/tenancy');
const controller = require('../controllers/platformController');

/**
 * Platform operator only. These handlers span organisations, so they run with
 * the tenant filter explicitly off; no other route accepts `platform_admin`.
 */
const router = express.Router();

router.use(authenticatePlatform, authorize(ROLES.PLATFORM_ADMIN));
router.use((req, res, next) => context.withoutTenant('platform', next));

router
  .route('/organizations')
  .get(validate(schemas.listOrganizations), controller.listOrganizations)
  .post(validate(schemas.createOrganization), controller.createOrganization);

router.patch('/organizations/:id', validate(schemas.updateOrganization), controller.updateOrganization);

module.exports = router;

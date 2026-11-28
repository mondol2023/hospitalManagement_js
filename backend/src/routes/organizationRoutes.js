'use strict';

const express = require('express');

const { authenticate, authorize, validate } = require('../middleware');
const { ROLES } = require('../utils/constants');
const schemas = require('../validators/tenancy');
const controller = require('../controllers/organizationController');

/** The caller's own organisation. */
const router = express.Router();

// Managers may read these resources but only admins change them.
const adminOnly = authorize(ROLES.ADMIN);

router.use(authenticate);

router.get('/', authorize(ROLES.ADMIN, ROLES.MANAGER), controller.get);
router.patch('/', adminOnly, validate(schemas.updateOwnOrganization), controller.update);

module.exports = router;

'use strict';

const express = require('express');

const { authenticate, authorize, requireStaff, validate } = require('../middleware');
const { ROLES } = require('../utils/constants');
const schemas = require('../validators/tenancy');
const controller = require('../controllers/branchController');

const router = express.Router();

// Managers may read these resources but only admins change them.
const adminOnly = authorize(ROLES.ADMIN);

router.use(authenticate);

router.get('/', requireStaff, validate(schemas.listBranches), controller.list);
router.post('/', adminOnly, validate(schemas.createBranch), controller.create);
router.patch('/:id', adminOnly, validate(schemas.updateBranch), controller.update);

module.exports = router;

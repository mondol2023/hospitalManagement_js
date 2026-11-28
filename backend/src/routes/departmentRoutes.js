'use strict';

const express = require('express');

const { authenticate, authorize, requireStaff, validate } = require('../middleware');
const { ROLES } = require('../utils/constants');
const schemas = require('../validators/tenancy');
const controller = require('../controllers/departmentController');

const router = express.Router();

// Managers may read these resources but only admins change them.
const adminOnly = authorize(ROLES.ADMIN);

router.use(authenticate);

router.get('/', requireStaff, validate(schemas.listDepartments), controller.list);
router.post('/', adminOnly, validate(schemas.createDepartment), controller.create);
router.patch('/:id', adminOnly, validate(schemas.updateDepartment), controller.update);

module.exports = router;

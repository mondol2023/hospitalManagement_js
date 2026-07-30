'use strict';

const express = require('express');

const { authenticate, requireAdmin, validate } = require('../middleware');
const schemas = require('../validators/user');
const controller = require('../controllers/userController');

/**
 * Account administration. Every route here is admin-only — a user editing their
 * *own* details does so through `/auth/me` and the role-specific `/…/me`
 * endpoints, which cannot reach another account no matter what id is supplied.
 *
 * Keeping the two apart means this router never has to ask "is this you?", and
 * the self-service routes never have to ask "are you an admin?".
 */
const router = express.Router();

router.use(authenticate, requireAdmin);

router.get('/statistics', controller.statistics);

router.route('/').get(validate(schemas.list), controller.list).post(validate(schemas.create), controller.create);

router
  .route('/:id')
  .get(validate(schemas.byId), controller.getById)
  .patch(validate(schemas.update), controller.update);

router.patch('/:id/role', validate(schemas.changeRole), controller.changeRole);
router.patch('/:id/active', validate(schemas.setActive), controller.setActive);

module.exports = router;

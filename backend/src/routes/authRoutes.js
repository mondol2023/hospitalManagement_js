'use strict';

const express = require('express');

const { authenticate, authLimiter, validate } = require('../middleware');
const schemas = require('../validators/auth');
const controller = require('../controllers/authController');

/**
 * Credential endpoints carry `authLimiter`, which is keyed by IP *and* by the
 * submitted email. Keying on IP alone lets one host spray a password across
 * thousands of accounts; keying on email alone lets an attacker lock a known
 * user out of their own account. Both keys, one bucket.
 *
 * `/refresh` is rate-limited too: it is the one unauthenticated endpoint that
 * does real work, so it is the obvious thing to hammer.
 */
const router = express.Router();

router.post('/register', authLimiter, validate(schemas.register), controller.register);
router.post('/login', authLimiter, validate(schemas.login), controller.login);
router.post('/refresh', authLimiter, validate(schemas.refresh), controller.refresh);
router.post('/logout', validate(schemas.logout), controller.logout);

router.use(authenticate);

router.get('/me', controller.me);
router.post('/logout-all', controller.logoutEverywhere);
router.post('/change-password', validate(schemas.changePassword), controller.changePassword);

module.exports = router;

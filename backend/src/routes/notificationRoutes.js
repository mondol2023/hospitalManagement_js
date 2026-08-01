'use strict';

const express = require('express');

const { authenticate, requireAdmin, validate } = require('../middleware');
const schemas = require('../validators/notification');
const controller = require('../controllers/notificationController');

/**
 * Self-service, with one administrative door.
 *
 * There is no "read another user's inbox" endpoint and no role that unlocks
 * one: a notification is a copy of something the recipient is already entitled
 * to see, so the inbox itself carries no information an operator needs.
 * Administrators can *send* — announcing planned downtime, chasing a handover —
 * which is the only asymmetric power here.
 */
const router = express.Router();

router.use(authenticate);

// Fixed segments before `/:id`.
router.get('/', validate(schemas.list), controller.list);
router.get('/unread-count', controller.countUnread);
router.post('/read-all', controller.markAllRead);

router.post('/', requireAdmin, validate(schemas.send), controller.send);

router.patch('/:id/read', validate(schemas.byId), controller.markRead);

module.exports = router;

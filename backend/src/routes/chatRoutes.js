'use strict';

const express = require('express');

const { authenticate, requireStaff, denyPatients, validate } = require('../middleware');
const schemas = require('../validators/chat');
const controller = require('../controllers/chatController');

/**
 * Two channels, as the hospital actually works.
 *
 *  - `POST /care-team/:patientId` — the patient, their doctor and their nurses.
 *    Membership is derived from the care team, never supplied, so there is no
 *    request shape that can put an unrelated account in a patient's channel.
 *  - `POST /staff` — doctors, nurses and other employees only. A patient in the
 *    participant list is a hard 403 rather than a silent drop.
 *
 * `POST /direct` is the private 1:1 between two employees; patients are refused
 * at the door by `denyPatients` and again by the service.
 *
 * Beyond those three, the router adds no authorisation of its own. Reading a
 * thread is *membership only* — `chatGuard.requireMember` is the single gate,
 * and it answers 404 rather than 403 for a non-member so a stranger cannot probe
 * which conversation ids exist. Layering `authorize(...)` on top would only
 * create a second, weaker rule to keep in sync, and would hand administrators a
 * back door into clinical conversations they are not part of.
 */
const router = express.Router();

router.use(authenticate);

// Fixed segments before `/:id`.
router.get('/', validate(schemas.inbox), controller.inbox);
router.get('/unread', controller.unread);

router.post('/care-team/:patientId', validate(schemas.openCareTeam), controller.openCareTeam);
router.post('/staff', requireStaff, validate(schemas.createStaffThread), controller.createStaffThread);
router.post('/direct', denyPatients, validate(schemas.openDirect), controller.openDirect);

router.delete('/messages/:messageId', validate(schemas.deleteMessage), controller.deleteMessage);

router.get('/:id', validate(schemas.byId), controller.getById);
router.get('/:id/messages', validate(schemas.history), controller.history);
router.post('/:id/messages', validate(schemas.send), controller.send);
router.post('/:id/read', validate(schemas.markRead), controller.markRead);
router.patch('/:id/archive', validate(schemas.setArchived), controller.setArchived);

router.post('/:id/participants', validate(schemas.addParticipant), controller.addParticipant);
router.delete(
  '/:id/participants/:userId',
  validate(schemas.removeParticipant),
  controller.removeParticipant
);

module.exports = router;

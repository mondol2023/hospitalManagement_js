'use strict';

const asyncHandler = require('../utils/asyncHandler');
const handle = require('../utils/handle');
const { sendSuccess } = require('../utils/apiResponse');
const chatService = require('../services/chatService');

/** Messaging over HTTP. */

const inbox = handle.page((req) => chatService.inbox(req.user, req.query));

const unread = handle((req) => chatService.unreadSummary(req.user));

const getById = handle((req) => chatService.getById(req.params.id, req.user));

/** Keyset paging — the response is a plain array, newest first, not a page envelope. */
const history = handle((req) => chatService.history(req.params.id, req.user, req.query));

/**
 * Find-or-create, so a repeat call is not an error. Both outcomes answer 201:
 * the caller wanted a usable channel and has one either way.
 */
const openCareTeam = handle.created((req) =>
  chatService.openCareTeam(req.params.patientId, req.user)
);

const createStaffThread = handle.created((req) =>
  chatService.createStaffThread(req.body, req.user)
);

const openDirect = handle.created((req) => chatService.openDirect(req.body.userId, req.user));

const send = handle.created((req) => chatService.send(req.params.id, req.body, req.user));

const markRead = asyncHandler(async (req, res) => {
  const data = await chatService.markRead(req.params.id, req.user, req.body.at);
  return sendSuccess(res, { data, message: 'Marked as read' });
});

const deleteMessage = asyncHandler(async (req, res) => {
  await chatService.deleteMessage(req.params.messageId, req.user);
  return sendSuccess(res, { message: 'Message deleted' });
});

const addParticipant = asyncHandler(async (req, res) => {
  const conversation = await chatService.addParticipant(req.params.id, req.body.userId, req.user);
  return sendSuccess(res, { data: conversation, message: 'Participant added' });
});

const removeParticipant = asyncHandler(async (req, res) => {
  const conversation = await chatService.removeParticipant(
    req.params.id,
    req.params.userId,
    req.user
  );
  return sendSuccess(res, { data: conversation, message: 'Participant removed' });
});

const setArchived = handle((req) =>
  chatService.setArchived(req.params.id, req.body.isArchived, req.user)
);

module.exports = {
  inbox,
  unread,
  getById,
  history,
  openCareTeam,
  createStaffThread,
  openDirect,
  send,
  markRead,
  deleteMessage,
  addParticipant,
  removeParticipant,
  setArchived,
};

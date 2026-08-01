'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated, sendPage } = require('../utils/apiResponse');
const chatService = require('../services/chatService');

/**
 * Messaging over HTTP.
 *
 * The socket gateway calls the same service methods with the same arguments, so
 * nothing here may add behaviour — a rule that would otherwise be invisible to a
 * client connected over the websocket.
 */

const inbox = asyncHandler(async (req, res) => {
  const page = await chatService.inbox(req.user, req.query);
  return sendPage(res, page);
});

const unread = asyncHandler(async (req, res) => {
  const data = await chatService.unreadSummary(req.user);
  return sendSuccess(res, { data });
});

const getById = asyncHandler(async (req, res) => {
  const conversation = await chatService.getById(req.params.id, req.user);
  return sendSuccess(res, { data: conversation });
});

/** Keyset paging — the response is a plain array, newest first, not a page envelope. */
const history = asyncHandler(async (req, res) => {
  const messages = await chatService.history(req.params.id, req.user, req.query);
  return sendSuccess(res, { data: messages });
});

/**
 * Find-or-create, so a repeat call is not an error. Both outcomes answer 201:
 * the caller wanted a usable channel and has one either way.
 */
const openCareTeam = asyncHandler(async (req, res) => {
  const conversation = await chatService.openCareTeam(req.params.patientId, req.user);
  return sendCreated(res, conversation);
});

const createStaffThread = asyncHandler(async (req, res) => {
  const conversation = await chatService.createStaffThread(req.body, req.user);
  return sendCreated(res, conversation);
});

const openDirect = asyncHandler(async (req, res) => {
  const conversation = await chatService.openDirect(req.body.userId, req.user);
  return sendCreated(res, conversation);
});

const send = asyncHandler(async (req, res) => {
  const message = await chatService.send(req.params.id, req.body, req.user);
  return sendCreated(res, message);
});

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

const setArchived = asyncHandler(async (req, res) => {
  const conversation = await chatService.setArchived(req.params.id, req.body.isArchived, req.user);
  return sendSuccess(res, { data: conversation });
});

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

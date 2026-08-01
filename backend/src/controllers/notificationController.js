'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated, sendPage } = require('../utils/apiResponse');
const notificationService = require('../services/notificationService');

/**
 * Every handler here scopes to `req.user.id`. That is not a convenience — the
 * repository puts the recipient in the *filter*, so an id guessed from another
 * account's inbox simply does not match.
 */

const list = asyncHandler(async (req, res) => {
  const page = await notificationService.list(req.user.id, req.query);
  return sendPage(res, page);
});

const countUnread = asyncHandler(async (req, res) => {
  const count = await notificationService.countUnread(req.user.id);
  return sendSuccess(res, { data: { count } });
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markRead(req.params.id, req.user.id);
  return sendSuccess(res, { data: notification });
});

const markAllRead = asyncHandler(async (req, res) => {
  const data = await notificationService.markAllRead(req.user.id);
  return sendSuccess(res, { data, message: 'All notifications marked as read' });
});

const send = asyncHandler(async (req, res) => {
  const notification = await notificationService.notify(req.body);
  return sendCreated(res, notification);
});

module.exports = { list, countUnread, markRead, markAllRead, send };

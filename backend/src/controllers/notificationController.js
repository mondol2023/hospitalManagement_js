'use strict';

const asyncHandler = require('../utils/asyncHandler');
const handle = require('../utils/handle');
const { sendSuccess } = require('../utils/apiResponse');
const notificationService = require('../services/notificationService');

/**
 * id`. That is not a convenience — the repository puts the recipient in the *filter*, so an id
 * guessed from another account's inbox simply does not match.
 */

const list = handle.page((req) => notificationService.list(req.user.id, req.query));

const countUnread = asyncHandler(async (req, res) => {
  const count = await notificationService.countUnread(req.user.id);
  return sendSuccess(res, { data: { count } });
});

const markRead = handle((req) => notificationService.markRead(req.params.id, req.user.id));

const markAllRead = asyncHandler(async (req, res) => {
  const data = await notificationService.markAllRead(req.user.id);
  return sendSuccess(res, { data, message: 'All notifications marked as read' });
});

const send = handle.created((req) => notificationService.notify(req.body));

module.exports = { list, countUnread, markRead, markAllRead, send };

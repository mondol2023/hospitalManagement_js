'use strict';

const { z, objectId, idParam, listQuery, shortText, longText, boolish, dateValue } = require('./common');
const {
  NOTIFICATION_TYPE_VALUES,
  NOTIFICATION_CHANNEL_VALUES,
} = require('../utils/constants');

/**
 * The notification inbox is always the caller's own — there is no `userId`
 * filter to validate, because there is no endpoint that reads somebody else's.
 *
 * `send` is the one exception and it is administrative: an operator announcing
 * downtime to a named user. `data` is capped at string values so a caller cannot
 * push an arbitrarily nested object into the stored document.
 */

const list = {
  query: listQuery({
    type: z.enum(NOTIFICATION_TYPE_VALUES).optional(),
    unreadOnly: boolish.optional(),
  }),
};

const byId = { params: idParam() };

const send = {
  body: z.object({
    recipient: objectId,
    title: shortText(200),
    message: longText(2000),
    type: z.enum(NOTIFICATION_TYPE_VALUES).optional(),
    channels: z.array(z.enum(NOTIFICATION_CHANNEL_VALUES)).min(1).max(3).optional(),
    data: z.record(z.string().max(500)).optional(),
    expiresAt: dateValue.optional(),
  }),
};

module.exports = { list, byId, send };

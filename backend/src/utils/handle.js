'use strict';

const asyncHandler = require('./asyncHandler');
const { sendSuccess, sendCreated, sendPage } = require('./apiResponse');

// `fn(req)` returns the payload; the wrapper owns the envelope and error forwarding.
const wrap = (send) => (fn) => asyncHandler(async (req, res) => send(res, await fn(req)));

const handle = wrap((res, data) => sendSuccess(res, { data }));
handle.created = wrap(sendCreated);
handle.page = wrap(sendPage);

module.exports = handle;

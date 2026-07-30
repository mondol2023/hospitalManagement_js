'use strict';

const crypto = require('crypto');

/**
 * Gives every request a stable id.
 *
 * At 10k users the logs are the only way to reconstruct what happened, and a
 * stack trace with no correlation id is a stack trace you cannot tie to the
 * 500 the user is complaining about. The id is echoed in the response header
 * *and* in the error envelope, so a user can quote it and support can find the
 * exact log line.
 *
 * An inbound `x-request-id` is honoured so a trace survives a proxy hop, but it
 * is length-capped and stripped of anything that is not id-shaped — it ends up
 * in log output, and a caller-supplied newline is how log injection starts.
 */

const MAX_ID_LENGTH = 64;
const UNSAFE = /[^\w.:-]/g;

function normaliseInboundId(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(UNSAFE, '').slice(0, MAX_ID_LENGTH);
  return cleaned || null;
}

function requestContext(req, res, next) {
  req.id = normaliseInboundId(req.headers['x-request-id']) || crypto.randomUUID();
  req.startedAt = process.hrtime.bigint();
  res.setHeader('X-Request-Id', req.id);
  next();
}

/** Milliseconds since `requestContext` ran, or `null` if it never did. */
function elapsedMs(req) {
  if (!req || typeof req.startedAt !== 'bigint') return null;
  return Number(process.hrtime.bigint() - req.startedAt) / 1e6;
}

module.exports = requestContext;
module.exports.requestContext = requestContext;
module.exports.elapsedMs = elapsedMs;
module.exports.normaliseInboundId = normaliseInboundId;

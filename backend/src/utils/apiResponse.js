'use strict';

/**
 * One response envelope for the entire API.
 *
 * The original controllers mixed `res.json(doc)`, `res.status(200).json({...})`
 * and `res.status(201).json(doc)` with no consistent shape, so clients had to
 * special-case each endpoint. Everything now returns
 * `{ success, data, meta? }` or `{ success:false, error:{...} }`.
 */

function sendSuccess(res, { data = null, status = 200, meta } = {}) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

function sendCreated(res, data) {
  return sendSuccess(res, { data, status: 201 });
}

/** Sends a `buildPage()` result, hoisting pagination into `meta`. */
function sendPage(res, { items, pagination }) {
  return sendSuccess(res, { data: items, meta: { pagination } });
}

function sendNoContent(res) {
  return res.status(204).send();
}

module.exports = { sendSuccess, sendCreated, sendPage, sendNoContent };

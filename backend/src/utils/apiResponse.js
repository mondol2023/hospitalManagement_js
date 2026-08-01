'use strict';

/**
 * One response envelope for the entire API.
 *
 * The original controllers mixed `res.json(doc)`, `res.status(200).json({...})`
 * and `res.status(201).json(doc)` with no consistent shape, so clients had to
 * special-case each endpoint. Everything now returns
 * `{ success, data, meta? }` or `{ success:false, error:{...} }`.
 */

/**
 * Normalises a document's wire format: `_id` becomes `id`, `__v` is dropped.
 *
 * The `toJSON` model plugin already does this — but only for *hydrated*
 * documents. Repository reads are `lean()` by default (deliberately: hydration
 * costs several times the memory per document, and list endpoints are the hot
 * path), and a lean result is a plain object that never passes through a schema
 * transform. The effect was an API where `POST /care-logs/vitals` answered with
 * `{ id }` and `GET /care-logs/patient/:id` answered with `{ _id, __v }` — same
 * collection, same client, two shapes.
 *
 * Doing it here rather than in the repository is the important part. Service and
 * controller code legitimately works in terms of `_id` (`req.patient._id`,
 * `patient.primaryDoctor`); renaming the field at the persistence boundary would
 * mean rewriting all of it and would break every internal comparison. The wire
 * format is a presentation concern, so it is applied exactly once, at the edge.
 *
 * The walk costs one pass over the response body. `JSON.stringify` is about to
 * make the same pass regardless, so this roughly doubles a cost that was never
 * the bottleneck — worth it for a contract a client can rely on.
 */
function toWire(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(toWire);

  // Documents, ObjectIds, Dates and Buffers all define their own wire form.
  // Deferring to it keeps this identical to what `res.json` would have produced,
  // rather than walking Mongoose internals.
  if (typeof value.toJSON === 'function') {
    const json = value.toJSON();
    if (json !== value) return toWire(json);
  }

  const out = {};
  let id;
  for (const [key, val] of Object.entries(value)) {
    if (key === '__v') continue;
    if (key === '_id') {
      id = toWire(val);
      continue;
    }
    out[key] = toWire(val);
  }
  // An explicit `id` on the source wins: a hydrated document has already made
  // the substitution, and overwriting it here would be a no-op at best.
  if (id !== undefined && out.id === undefined) out.id = id;
  return out;
}

/**
 * `message` is the human-readable half of an action's outcome — "Marked as
 * read", "Participant removed" — for endpoints whose `data` is a bare
 * acknowledgement or nothing at all. Nine controllers were already passing it
 * and it was being silently dropped here, so every one of those confirmations
 * reached the client as `{ success: true, data: null }`.
 */
function sendSuccess(res, { data = null, status = 200, meta, message } = {}) {
  const body = { success: true, data: toWire(data) };
  if (message) body.message = message;
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

module.exports = { sendSuccess, sendCreated, sendPage, sendNoContent, toWire };

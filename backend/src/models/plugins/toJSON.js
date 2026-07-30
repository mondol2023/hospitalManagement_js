'use strict';

/**
 * Normalises every document's wire format: `_id` becomes `id`, `__v` and any
 * field marked `private: true` in the schema are stripped.
 *
 * Applied globally so no model can accidentally serialise a secret. The original
 * code tried to do this per-query with `.select('-password')` and got it wrong in
 * at least two places (`getAllUsers` returned hashes outright; `getUserId` used
 * `.select(-"password")`, which evaluates to `NaN`).
 */
function toJSONPlugin(schema) {
  const existingTransform = schema.get('toJSON')?.transform;

  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform(doc, ret, options) {
      // Strip fields the schema declares private (e.g. password).
      for (const [path, definition] of Object.entries(schema.paths)) {
        if (definition.options?.private) {
          deletePath(ret, path);
        }
      }

      ret.id = ret._id?.toString() ?? ret.id;
      delete ret._id;
      delete ret.__v;

      return existingTransform ? existingTransform(doc, ret, options) : ret;
    },
  });
}

/** Deletes a possibly-nested path such as `emergencyContact.phone`. */
function deletePath(obj, path) {
  const segments = path.split('.');
  let cursor = obj;
  for (let i = 0; i < segments.length - 1; i += 1) {
    cursor = cursor?.[segments[i]];
    if (!cursor || typeof cursor !== 'object') return;
  }
  delete cursor[segments[segments.length - 1]];
}

module.exports = toJSONPlugin;

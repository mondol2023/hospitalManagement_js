'use strict';

const { z, idParam, listQuery, shortText, optionalText, boolish, nonEmptyPatch } = require('./common');
const { ROLE_VALUES } = require('../utils/constants');
const { PROFILE_BY_ROLE } = require('./profiles');
const { email, phone, password } = require('./auth');

/**
 * Administrative account management.
 *
 * `create` is a discriminated union on `role` rather than one object with a
 * loose `profile: object`. The union is what makes `role: 'doctor'` with a
 * nurse's profile a 422 at the edge instead of a Mongoose validation error
 * thrown halfway through a transaction — and it keeps the unknown-key stripping
 * that a `z.record()` escape hatch would throw away.
 */

const accountFields = {
  name: shortText(120),
  email,
  password,
  phone: phone.optional(),
  address: optionalText(500),
};

const bodyForRole = (role) =>
  z.object({ ...accountFields, role: z.literal(role), profile: PROFILE_BY_ROLE[role] });

const create = {
  body: z.discriminatedUnion('role', ROLE_VALUES.map(bodyForRole)),
};

const list = {
  query: listQuery({
    search: z.string().trim().max(120).optional(),
    role: z.enum(ROLE_VALUES).optional(),
    isActive: boolish.optional(),
  }),
};

const byId = { params: idParam() };

/**
 * Only the four fields `userService.update` will act on. `email`, `password` and
 * `role` each have a dedicated endpoint because each has side effects — a token
 * revocation, a profile migration — that a generic `$set` would skip.
 */
const update = {
  params: idParam(),
  body: nonEmptyPatch(
    z.object({
      name: shortText(120).optional(),
      phone: phone.optional(),
      address: optionalText(500),
      profilePic: z.string().trim().url().max(2048).optional(),
    })
  ),
};

/**
 * The profile is required, not optional: when the target role has no profile row
 * yet the service creates one, and a doctor without a specialization fails
 * schema validation inside the transaction. Supplying it costs the admin one
 * form; omitting it costs them a 500.
 */
const changeRole = {
  params: idParam(),
  body: z.discriminatedUnion(
    'role',
    ROLE_VALUES.map((role) => z.object({ role: z.literal(role), profile: PROFILE_BY_ROLE[role] }))
  ),
};

const setActive = {
  params: idParam(),
  body: z.object({ isActive: z.boolean() }),
};

module.exports = { create, list, byId, update, changeRole, setActive };

'use strict';

const accessPolicy = require('./accessPolicy');

/**
 * Which roster rows a caller may see, for the staff, nurse and doctor lists.
 *
 * Everyone gets active people only. An administrator may widen that with
 * `status` (`active` | `inactive` | `all`) and, for doctors, `accepting`. The
 * parameters are **ignored** for anyone else rather than rejected, so a client
 * shared across roles can send them safely and still never see a former
 * employee. The decision lives here, not in a validator, because a validator
 * does not know who is calling.
 *
 * @param {{status?: string, accepting?: boolean|string}} query validated query
 * @param {{role: string}} [actor] `req.user`
 * @returns {{
 *   admin: boolean,
 *   status: 'active'|'inactive'|'all',
 *   accepting: boolean|undefined,
 *   isActive: boolean|undefined
 * }} `isActive` is `undefined` for `all`, meaning "do not filter on it".
 */
function rosterScope(query = {}, actor) {
  const admin = Boolean(actor) && accessPolicy.isAdmin(actor.role);
  const status = admin && query.status ? query.status : 'active';

  let accepting;
  if (admin && query.accepting !== undefined) {
    accepting = query.accepting === true || query.accepting === 'true';
  }

  return {
    admin,
    status,
    accepting,
    isActive: status === 'all' ? undefined : status === 'active',
  };
}

module.exports = rosterScope;

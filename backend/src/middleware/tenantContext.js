'use strict';

const context = require('../utils/context');

/**
 * Binds the request store. Mounted after the body parsers: they call next()
 * from stream callbacks, which can drop AsyncLocalStorage context.
 */
function tenantContext(req, res, next) {
  context.run({ requestId: req.id, ip: req.ip, source: 'http' }, next);
}

module.exports = tenantContext;
module.exports.tenantContext = tenantContext;

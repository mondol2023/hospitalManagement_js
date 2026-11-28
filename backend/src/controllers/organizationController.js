'use strict';

const handle = require('../utils/handle');
const organizationService = require('../services/organizationService');

const get = handle(() => organizationService.getOwn());
const update = handle((req) => organizationService.updateOwn(req.body));

module.exports = { get, update };

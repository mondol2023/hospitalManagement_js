'use strict';

const handle = require('../utils/handle');
const platformService = require('../services/platformService');

const createOrganization = handle.created((req) => platformService.createOrganization(req.body));
const listOrganizations = handle.page((req) => platformService.list(req.query));
const updateOrganization = handle((req) => platformService.update(req.params.id, req.body));

module.exports = { createOrganization, listOrganizations, updateOrganization };

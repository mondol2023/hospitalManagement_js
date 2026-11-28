'use strict';

const handle = require('../utils/handle');
const branchService = require('../services/branchService');

const list = handle.page((req) => branchService.list(req.query));
const create = handle.created((req) => branchService.create(req.body));
const update = handle((req) => branchService.update(req.params.id, req.body));

module.exports = { list, create, update };

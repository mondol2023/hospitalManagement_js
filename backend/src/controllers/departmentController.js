'use strict';

const handle = require('../utils/handle');
const departmentService = require('../services/departmentService');

const list = handle.page((req) => departmentService.list(req.query));
const create = handle.created((req) => departmentService.create(req.body));
const update = handle((req) => departmentService.update(req.params.id, req.body));

module.exports = { list, create, update };

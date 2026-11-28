'use strict';

const handle = require('../utils/handle');
const userService = require('../services/userService');

const create = handle.created((req) => userService.createAccount(req.body));

const list = handle.page((req) => userService.list(req.query));

const getById = handle((req) => userService.getById(req.params.id));

const update = handle((req) => userService.update(req.params.id, req.body));

const changeRole = handle((req) =>
  userService.changeRole(req.params.id, req.body.role, req.body.profile, req.user)
);

const setBranches = handle((req) => userService.setBranches(req.params.id, req.body.branchIds));

const setActive = handle((req) =>
  userService.setActive(req.params.id, req.body.isActive, req.user)
);

const statistics = handle(() => userService.statistics());

module.exports = { create, list, getById, update, changeRole, setBranches, setActive, statistics };

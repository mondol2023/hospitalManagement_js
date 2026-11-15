'use strict';

const handle = require('../utils/handle');
const staffService = require('../services/staffService');

const list = handle.page((req) => staffService.list(req.query));

const me = handle((req) => staffService.getByUser(req.user.id));

const updateOwn = handle((req) => staffService.updateOwnProfile(req.user.id, req.body));

const setDuty = handle((req) => staffService.setDuty(req.user.id, req.body.isOnDuty));

const myReports = handle((req) => staffService.reportsTo(req.user.id));

const getByUser = handle((req) => staffService.getByUser(req.params.userId));

const updateEmployment = handle((req) => staffService.updateEmployment(req.params.id, req.body));

module.exports = { list, me, updateOwn, setDuty, myReports, getByUser, updateEmployment };

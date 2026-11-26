'use strict';

const handle = require('../utils/handle');
const nurseService = require('../services/nurseService');

const list = handle.page((req) => nurseService.list(req.query, req.user));

const me = handle((req) => nurseService.getByUser(req.user.id));

const updateOwn = handle((req) => nurseService.updateOwnProfile(req.user.id, req.body));

const setDuty = handle((req) => nurseService.setDuty(req.user.id, req.body.isOnDuty));

const workload = handle((req) => nurseService.workload(req.user.id));

const getByUser = handle((req) => nurseService.getByUser(req.params.userId));

const onDutyInWard = handle((req) => nurseService.onDutyInWard(req.params.ward));

const updateRoster = handle((req) => nurseService.updateRoster(req.params.id, req.body));

module.exports = { list, me, updateOwn, setDuty, workload, getByUser, onDutyInWard, updateRoster };

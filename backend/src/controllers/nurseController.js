'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendPage } = require('../utils/apiResponse');
const nurseService = require('../services/nurseService');

const list = asyncHandler(async (req, res) => {
  const page = await nurseService.list(req.query);
  return sendPage(res, page);
});

const me = asyncHandler(async (req, res) => {
  const nurse = await nurseService.getByUser(req.user.id);
  return sendSuccess(res, { data: nurse });
});

const updateOwn = asyncHandler(async (req, res) => {
  const nurse = await nurseService.updateOwnProfile(req.user.id, req.body);
  return sendSuccess(res, { data: nurse });
});

const setDuty = asyncHandler(async (req, res) => {
  const nurse = await nurseService.setDuty(req.user.id, req.body.isOnDuty);
  return sendSuccess(res, { data: nurse });
});

const workload = asyncHandler(async (req, res) => {
  const data = await nurseService.workload(req.user.id);
  return sendSuccess(res, { data });
});

const getByUser = asyncHandler(async (req, res) => {
  const nurse = await nurseService.getByUser(req.params.userId);
  return sendSuccess(res, { data: nurse });
});

const onDutyInWard = asyncHandler(async (req, res) => {
  const data = await nurseService.onDutyInWard(req.params.ward);
  return sendSuccess(res, { data });
});

const updateRoster = asyncHandler(async (req, res) => {
  const nurse = await nurseService.updateRoster(req.params.id, req.body);
  return sendSuccess(res, { data: nurse });
});

module.exports = { list, me, updateOwn, setDuty, workload, getByUser, onDutyInWard, updateRoster };

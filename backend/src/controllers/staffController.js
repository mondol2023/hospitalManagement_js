'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendPage } = require('../utils/apiResponse');
const staffService = require('../services/staffService');

const list = asyncHandler(async (req, res) => {
  const page = await staffService.list(req.query);
  return sendPage(res, page);
});

const me = asyncHandler(async (req, res) => {
  const profile = await staffService.getByUser(req.user.id);
  return sendSuccess(res, { data: profile });
});

const updateOwn = asyncHandler(async (req, res) => {
  const profile = await staffService.updateOwnProfile(req.user.id, req.body);
  return sendSuccess(res, { data: profile });
});

const setDuty = asyncHandler(async (req, res) => {
  const profile = await staffService.setDuty(req.user.id, req.body.isOnDuty);
  return sendSuccess(res, { data: profile });
});

const myReports = asyncHandler(async (req, res) => {
  const data = await staffService.reportsTo(req.user.id);
  return sendSuccess(res, { data });
});

const getByUser = asyncHandler(async (req, res) => {
  const profile = await staffService.getByUser(req.params.userId);
  return sendSuccess(res, { data: profile });
});

const updateEmployment = asyncHandler(async (req, res) => {
  const profile = await staffService.updateEmployment(req.params.id, req.body);
  return sendSuccess(res, { data: profile });
});

module.exports = { list, me, updateOwn, setDuty, myReports, getByUser, updateEmployment };

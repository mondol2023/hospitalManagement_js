'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated, sendPage } = require('../utils/apiResponse');
const userService = require('../services/userService');

const create = asyncHandler(async (req, res) => {
  const user = await userService.createAccount(req.body);
  return sendCreated(res, user);
});

const list = asyncHandler(async (req, res) => {
  const page = await userService.list(req.query);
  return sendPage(res, page);
});

const getById = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  return sendSuccess(res, { data: user });
});

const update = asyncHandler(async (req, res) => {
  const user = await userService.update(req.params.id, req.body);
  return sendSuccess(res, { data: user });
});

const changeRole = asyncHandler(async (req, res) => {
  const user = await userService.changeRole(req.params.id, req.body.role, req.body.profile);
  return sendSuccess(res, { data: user });
});

const setActive = asyncHandler(async (req, res) => {
  const user = await userService.setActive(req.params.id, req.body.isActive);
  return sendSuccess(res, { data: user });
});

const statistics = asyncHandler(async (req, res) => {
  const stats = await userService.statistics();
  return sendSuccess(res, { data: stats });
});

module.exports = { create, list, getById, update, changeRole, setActive, statistics };

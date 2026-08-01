'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated, sendPage } = require('../utils/apiResponse');
const emergencyService = require('../services/emergencyService');

const raise = asyncHandler(async (req, res) => {
  const alert = await emergencyService.raise(req.body, req.user);
  return sendCreated(res, alert);
});

const activeBoard = asyncHandler(async (req, res) => {
  const page = await emergencyService.activeBoard(req.query, req.user);
  return sendPage(res, page);
});

const list = asyncHandler(async (req, res) => {
  const page = await emergencyService.list(req.query, req.user);
  return sendPage(res, page);
});

const listForPatient = asyncHandler(async (req, res) => {
  const page = await emergencyService.listForPatient(req.params.patientId, req.user, req.query);
  return sendPage(res, page);
});

const countOpen = asyncHandler(async (req, res) => {
  const count = await emergencyService.countOpen(req.user);
  return sendSuccess(res, { data: { count } });
});

const responseStats = asyncHandler(async (req, res) => {
  const data = await emergencyService.responseStats(req.query, req.user);
  return sendSuccess(res, { data });
});

const getById = asyncHandler(async (req, res) => {
  const alert = await emergencyService.getById(req.params.id, req.user);
  return sendSuccess(res, { data: alert });
});

const acknowledge = asyncHandler(async (req, res) => {
  const alert = await emergencyService.acknowledge(req.params.id, req.user);
  return sendSuccess(res, { data: alert });
});

const resolve = asyncHandler(async (req, res) => {
  const alert = await emergencyService.resolve(req.params.id, req.body, req.user);
  return sendSuccess(res, { data: alert });
});

const escalate = asyncHandler(async (req, res) => {
  const alert = await emergencyService.escalate(req.params.id, req.body.severity, req.user);
  return sendSuccess(res, { data: alert });
});

module.exports = {
  raise,
  activeBoard,
  list,
  listForPatient,
  countOpen,
  responseStats,
  getById,
  acknowledge,
  resolve,
  escalate,
};

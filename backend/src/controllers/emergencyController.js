'use strict';

const asyncHandler = require('../utils/asyncHandler');
const handle = require('../utils/handle');
const { sendSuccess } = require('../utils/apiResponse');
const emergencyService = require('../services/emergencyService');

const raise = handle.created((req) => emergencyService.raise(req.body, req.user));

const activeBoard = handle.page((req) => emergencyService.activeBoard(req.query, req.user));

const list = handle.page((req) => emergencyService.list(req.query, req.user));

const listForPatient = handle.page((req) =>
  emergencyService.listForPatient(req.params.patientId, req.user, req.query)
);

const countOpen = asyncHandler(async (req, res) => {
  const count = await emergencyService.countOpen(req.user);
  return sendSuccess(res, { data: { count } });
});

const responseStats = handle((req) => emergencyService.responseStats(req.query, req.user));

const getById = handle((req) => emergencyService.getById(req.params.id, req.user));

const acknowledge = handle((req) => emergencyService.acknowledge(req.params.id, req.user));

const resolve = handle((req) => emergencyService.resolve(req.params.id, req.body, req.user));

const escalate = handle((req) =>
  emergencyService.escalate(req.params.id, req.body.severity, req.user)
);

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

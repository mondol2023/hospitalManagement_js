'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated, sendPage } = require('../utils/apiResponse');
const careLogService = require('../services/careLogService');

/**
 * Every write here resolves the patient from the *body*, so the routes load the
 * patient from `body.patientId` and run the care-team guard before the handler.
 * The service re-checks; the middleware exists so the 403 costs one read rather
 * than the full write path.
 */

const administerMedication = asyncHandler(async (req, res) => {
  const log = await careLogService.administerMedication(req.body, req.user);
  return sendCreated(res, log);
});

const recordVitals = asyncHandler(async (req, res) => {
  const log = await careLogService.recordVitals(req.body, req.user);
  return sendCreated(res, log);
});

const logService = asyncHandler(async (req, res) => {
  const log = await careLogService.logService(req.body, req.user);
  return sendCreated(res, log);
});

const logProcedure = asyncHandler(async (req, res) => {
  const log = await careLogService.logProcedure(req.body, req.user);
  return sendCreated(res, log);
});

const logObservation = asyncHandler(async (req, res) => {
  const log = await careLogService.logObservation(req.body, req.user);
  return sendCreated(res, log);
});

const handover = asyncHandler(async (req, res) => {
  const log = await careLogService.handover(req.body, req.user);
  return sendCreated(res, log);
});

const timeline = asyncHandler(async (req, res) => {
  const page = await careLogService.timeline(req.patient._id, req.user, req.query);
  return sendPage(res, page);
});

const latestVitals = asyncHandler(async (req, res) => {
  const data = await careLogService.latestVitals(req.patient._id, req.user);
  return sendSuccess(res, { data });
});

const wardFeed = asyncHandler(async (req, res) => {
  const page = await careLogService.wardFeed(req.params.ward, req.user, req.query);
  return sendPage(res, page);
});

const myEntries = asyncHandler(async (req, res) => {
  const page = await careLogService.myEntries(req.user, req.query);
  return sendPage(res, page);
});

const attentionQueue = asyncHandler(async (req, res) => {
  const page = await careLogService.attentionQueue(req.user, { ward: req.query.ward }, req.query);
  return sendPage(res, page);
});

const getById = asyncHandler(async (req, res) => {
  const log = await careLogService.getById(req.params.id, req.user);
  return sendSuccess(res, { data: log });
});

const acknowledge = asyncHandler(async (req, res) => {
  const log = await careLogService.acknowledge(req.params.id, req.user, req.body.note);
  return sendSuccess(res, { data: log });
});

const correct = asyncHandler(async (req, res) => {
  const log = await careLogService.correct(req.params.id, req.body, req.user);
  return sendCreated(res, log);
});

module.exports = {
  administerMedication,
  recordVitals,
  logService,
  logProcedure,
  logObservation,
  handover,
  timeline,
  latestVitals,
  wardFeed,
  myEntries,
  attentionQueue,
  getById,
  acknowledge,
  correct,
};

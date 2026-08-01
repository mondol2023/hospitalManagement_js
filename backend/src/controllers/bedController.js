'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated, sendPage } = require('../utils/apiResponse');
const bedService = require('../services/bedService');

const list = asyncHandler(async (req, res) => {
  const page = await bedService.list(req.query);
  return sendPage(res, page);
});

const available = asyncHandler(async (req, res) => {
  const data = await bedService.available(req.query);
  return sendSuccess(res, { data });
});

const occupancy = asyncHandler(async (req, res) => {
  const data = await bedService.occupancy();
  return sendSuccess(res, { data });
});

const wards = asyncHandler(async (req, res) => {
  const data = await bedService.wards();
  return sendSuccess(res, { data });
});

const getById = asyncHandler(async (req, res) => {
  const bed = await bedService.getById(req.params.id);
  return sendSuccess(res, { data: bed });
});

const create = asyncHandler(async (req, res) => {
  const bed = await bedService.create(req.body);
  return sendCreated(res, bed);
});

const update = asyncHandler(async (req, res) => {
  const bed = await bedService.update(req.params.id, req.body);
  return sendSuccess(res, { data: bed });
});

const setStatus = asyncHandler(async (req, res) => {
  const bed = await bedService.setStatus(req.params.id, req.body.status);
  return sendSuccess(res, { data: bed });
});

const assign = asyncHandler(async (req, res) => {
  const bed = await bedService.assign(
    { bedId: req.params.id, patientId: req.body.patientId },
    req.user
  );
  return sendSuccess(res, { data: bed });
});

const transfer = asyncHandler(async (req, res) => {
  const bed = await bedService.transfer(
    { toBedId: req.params.id, patientId: req.body.patientId },
    req.user
  );
  return sendSuccess(res, { data: bed });
});

const release = asyncHandler(async (req, res) => {
  const bed = await bedService.release(req.body.patientId, req.user);
  return sendSuccess(res, { data: bed });
});

const remove = asyncHandler(async (req, res) => {
  const data = await bedService.remove(req.params.id);
  return sendSuccess(res, { data });
});

module.exports = {
  list,
  available,
  occupancy,
  wards,
  getById,
  create,
  update,
  setStatus,
  assign,
  transfer,
  release,
  remove,
};

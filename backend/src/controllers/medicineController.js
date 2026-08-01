'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated, sendPage } = require('../utils/apiResponse');
const medicineService = require('../services/medicineService');

const list = asyncHandler(async (req, res) => {
  const page = await medicineService.list(req.query);
  return sendPage(res, page);
});

const lowStock = asyncHandler(async (req, res) => {
  const data = await medicineService.lowStock();
  return sendSuccess(res, { data });
});

const expiring = asyncHandler(async (req, res) => {
  const data = await medicineService.expiring(req.query);
  return sendSuccess(res, { data });
});

const expired = asyncHandler(async (req, res) => {
  const data = await medicineService.expired();
  return sendSuccess(res, { data });
});

const getById = asyncHandler(async (req, res) => {
  const medicine = await medicineService.getById(req.params.id);
  return sendSuccess(res, { data: medicine });
});

const create = asyncHandler(async (req, res) => {
  const medicine = await medicineService.create(req.body, req.user);
  return sendCreated(res, medicine);
});

const update = asyncHandler(async (req, res) => {
  const medicine = await medicineService.update(req.params.id, req.body, req.user);
  return sendSuccess(res, { data: medicine });
});

const deactivate = asyncHandler(async (req, res) => {
  const medicine = await medicineService.deactivate(req.params.id, req.user);
  return sendSuccess(res, { data: medicine });
});

const activate = asyncHandler(async (req, res) => {
  const medicine = await medicineService.activate(req.params.id, req.user);
  return sendSuccess(res, { data: medicine });
});

const remove = asyncHandler(async (req, res) => {
  const data = await medicineService.remove(req.params.id, req.user);
  return sendSuccess(res, { data });
});

const restock = asyncHandler(async (req, res) => {
  const medicine = await medicineService.restock(req.params.id, req.body.quantity, req.user);
  return sendSuccess(res, { data: medicine });
});

const dispense = asyncHandler(async (req, res) => {
  const medicine = await medicineService.dispense(req.params.id, req.body.quantity, req.user, {
    reason: req.body.reason,
  });
  return sendSuccess(res, { data: medicine });
});

const adjust = asyncHandler(async (req, res) => {
  const medicine = await medicineService.adjust(req.params.id, req.body.delta, req.user, {
    reason: req.body.reason,
  });
  return sendSuccess(res, { data: medicine });
});

const withdrawExpired = asyncHandler(async (req, res) => {
  const data = await medicineService.withdrawExpired();
  return sendSuccess(res, { data });
});

module.exports = {
  list,
  lowStock,
  expiring,
  expired,
  getById,
  create,
  update,
  deactivate,
  activate,
  remove,
  restock,
  dispense,
  adjust,
  withdrawExpired,
};

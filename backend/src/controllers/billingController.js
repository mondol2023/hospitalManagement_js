'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated, sendPage } = require('../utils/apiResponse');
const billingService = require('../services/billingService');

const list = asyncHandler(async (req, res) => {
  const page = await billingService.list(req.query, req.user);
  return sendPage(res, page);
});

/**
 * `req.patient` comes from `loadPatient`, which resolves the `me` alias — a
 * patient asking for their own invoices does not know their patient id.
 */
const listForPatient = asyncHandler(async (req, res) => {
  const page = await billingService.listForPatient(req.patient._id, req.user, req.query);
  return sendPage(res, page);
});

const outstanding = asyncHandler(async (req, res) => {
  const page = await billingService.outstanding(req.query, req.user);
  return sendPage(res, page);
});

const revenue = asyncHandler(async (req, res) => {
  const data = await billingService.revenue(req.query, req.user);
  return sendSuccess(res, { data });
});

const paymentMethods = asyncHandler(async (req, res) => {
  const data = await billingService.paymentMethods();
  return sendSuccess(res, { data });
});

const getById = asyncHandler(async (req, res) => {
  const bill = await billingService.getById(req.params.id, req.user);
  return sendSuccess(res, { data: bill });
});

const getByInvoiceNumber = asyncHandler(async (req, res) => {
  const bill = await billingService.getByInvoiceNumber(req.params.invoiceNumber, req.user);
  return sendSuccess(res, { data: bill });
});

const create = asyncHandler(async (req, res) => {
  const bill = await billingService.create(req.body, req.user);
  return sendCreated(res, bill);
});

const buildFromCare = asyncHandler(async (req, res) => {
  const bill = await billingService.buildFromCare(req.params.patientId, req.user, req.body);
  return sendCreated(res, bill);
});

const addItems = asyncHandler(async (req, res) => {
  const bill = await billingService.addItems(req.params.id, req.body.items, req.user);
  return sendSuccess(res, { data: bill });
});

const update = asyncHandler(async (req, res) => {
  const bill = await billingService.update(req.params.id, req.body, req.user);
  return sendSuccess(res, { data: bill });
});

const issue = asyncHandler(async (req, res) => {
  const bill = await billingService.issue(req.params.id, req.user);
  return sendSuccess(res, { data: bill });
});

const voidBill = asyncHandler(async (req, res) => {
  const bill = await billingService.voidBill(req.params.id, req.body.reason, req.user);
  return sendSuccess(res, { data: bill });
});

const pay = asyncHandler(async (req, res) => {
  const bill = await billingService.pay(req.params.id, req.body, req.user);
  return sendSuccess(res, { data: bill });
});

const refund = asyncHandler(async (req, res) => {
  const bill = await billingService.refund(req.params.id, req.body, req.user);
  return sendSuccess(res, { data: bill });
});

module.exports = {
  list,
  listForPatient,
  outstanding,
  revenue,
  paymentMethods,
  getById,
  getByInvoiceNumber,
  create,
  buildFromCare,
  addItems,
  update,
  issue,
  voidBill,
  pay,
  refund,
};

'use strict';

const handle = require('../utils/handle');
const billingService = require('../services/billingService');

const list = handle.page((req) => billingService.list(req.query, req.user));

/**
 * `req.patient` comes from `loadPatient`, which resolves the `me` alias — a
 * patient asking for their own invoices does not know their patient id.
 */
const listForPatient = handle.page((req) =>
  billingService.listForPatient(req.patient._id, req.user, req.query)
);

const outstanding = handle.page((req) => billingService.outstanding(req.query, req.user));

const revenue = handle((req) => billingService.revenue(req.query, req.user));

const paymentMethods = handle(() => billingService.paymentMethods());

const getById = handle((req) => billingService.getById(req.params.id, req.user));

const getByInvoiceNumber = handle((req) =>
  billingService.getByInvoiceNumber(req.params.invoiceNumber, req.user)
);

const create = handle.created((req) => billingService.create(req.body, req.user));

const buildFromCare = handle.created((req) =>
  billingService.buildFromCare(req.params.patientId, req.user, req.body)
);

const addItems = handle((req) => billingService.addItems(req.params.id, req.body.items, req.user));

const update = handle((req) => billingService.update(req.params.id, req.body, req.user));

const issue = handle((req) => billingService.issue(req.params.id, req.user));

const voidBill = handle((req) => billingService.voidBill(req.params.id, req.body.reason, req.user));

const pay = handle((req) => billingService.pay(req.params.id, req.body, req.user));

const refund = handle((req) => billingService.refund(req.params.id, req.body, req.user));

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

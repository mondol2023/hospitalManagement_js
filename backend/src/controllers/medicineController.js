'use strict';

const handle = require('../utils/handle');
const medicineService = require('../services/medicineService');

const list = handle.page((req) => medicineService.list(req.query));

const lowStock = handle(() => medicineService.lowStock());

const expiring = handle((req) => medicineService.expiring(req.query));

const expired = handle(() => medicineService.expired());

const movements = handle.page((req) => medicineService.movements(req.query, req.user));

const stockReport = handle((req) => medicineService.stockReport(req.query, req.user));

const getById = handle((req) => medicineService.getById(req.params.id));

const create = handle.created((req) => medicineService.create(req.body, req.user));

const update = handle((req) => medicineService.update(req.params.id, req.body, req.user));

const deactivate = handle((req) => medicineService.deactivate(req.params.id, req.user));

const activate = handle((req) => medicineService.activate(req.params.id, req.user));

const remove = handle((req) => medicineService.remove(req.params.id, req.user));

const restock = handle((req) =>
  medicineService.restock(req.params.id, req.body.quantity, req.user)
);

const dispense = handle((req) =>
  medicineService.dispense(req.params.id, req.body.quantity, req.user, {
    reason: req.body.reason,
  })
);

const adjust = handle((req) =>
  medicineService.adjust(req.params.id, req.body.delta, req.user, {
    reason: req.body.reason,
  })
);

const withdrawExpired = handle(() => medicineService.withdrawExpired());

module.exports = {
  list,
  lowStock,
  expiring,
  expired,
  movements,
  stockReport,
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

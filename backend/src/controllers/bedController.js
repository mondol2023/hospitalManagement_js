'use strict';

const handle = require('../utils/handle');
const bedService = require('../services/bedService');

const list = handle.page((req) => bedService.list(req.query));

const available = handle((req) => bedService.available(req.query));

const occupancy = handle(() => bedService.occupancy());

const wards = handle(() => bedService.wards());

const getById = handle((req) => bedService.getById(req.params.id));

const create = handle.created((req) => bedService.create(req.body));

const update = handle((req) => bedService.update(req.params.id, req.body));

const setStatus = handle((req) => bedService.setStatus(req.params.id, req.body.status));

const assign = handle((req) =>
  bedService.assign(
    { bedId: req.params.id, patientId: req.body.patientId },
    req.user
  )
);

const transfer = handle((req) =>
  bedService.transfer(
    { toBedId: req.params.id, patientId: req.body.patientId },
    req.user
  )
);

const release = handle((req) => bedService.release(req.body.patientId, req.user));

const remove = handle((req) => bedService.remove(req.params.id));

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

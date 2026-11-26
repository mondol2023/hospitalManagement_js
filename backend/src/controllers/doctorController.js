'use strict';

const handle = require('../utils/handle');
const doctorService = require('../services/doctorService');

const list = handle.page((req) => doctorService.list(req.query, req.user));

const specializations = handle(() => doctorService.specializations());

const me = handle((req) => doctorService.getByUser(req.user.id));

const updateOwn = handle((req) => doctorService.updateOwnProfile(req.user.id, req.body));

const updateEmployment = handle((req) => doctorService.updateEmployment(req.params.id, req.body));

const setDuty = handle((req) => doctorService.setDuty(req.user.id, req.body.isOnDuty));

const getByUser = handle((req) => doctorService.getByUser(req.params.userId));

/** Availability is keyed by the doctor's *user* id — appointments reference the user. */
const availability = handle((req) => doctorService.availability(req.params.userId, req.query.date));

const getById = handle((req) => doctorService.getById(req.params.id));

module.exports = {
  list,
  specializations,
  me,
  updateOwn,
  updateEmployment,
  setDuty,
  getByUser,
  availability,
  getById,
};

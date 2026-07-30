'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendPage } = require('../utils/apiResponse');
const patientService = require('../services/patientService');

/**
 * Reads go through `patientService.requireVisible` rather than through the
 * `loadPatient` middleware: the service populates the linked user account and
 * applies the same visibility rule, so routing the read through it avoids
 * loading the document twice. Writes keep the middleware, because the care-team
 * decision needs the document *before* the handler runs.
 */

const list = asyncHandler(async (req, res) => {
  const page = await patientService.list(req.query);
  return sendPage(res, page);
});

const caseload = asyncHandler(async (req, res) => {
  const page = await patientService.caseload(req.user.id, req.query);
  return sendPage(res, page);
});

const ward = asyncHandler(async (req, res) => {
  const page = await patientService.ward(req.params.ward, req.query);
  return sendPage(res, page);
});

const me = asyncHandler(async (req, res) => {
  const patient = await patientService.requireOwnRecord(req.user.id);
  return sendSuccess(res, { data: patient });
});

const updateOwn = asyncHandler(async (req, res) => {
  const patient = await patientService.updateOwnDetails(req.user.id, req.body);
  return sendSuccess(res, { data: patient });
});

const byMrn = asyncHandler(async (req, res) => {
  const patient = await patientService.findByMrn(req.params.mrn, req.user);
  return sendSuccess(res, { data: patient });
});

const getById = asyncHandler(async (req, res) => {
  const patient = await patientService.resolveForActor(req.user, req.params.patientId);
  return sendSuccess(res, { data: patient });
});

const updateClinical = asyncHandler(async (req, res) => {
  const patient = await patientService.updateClinicalDetails(req.patient._id, req.body);
  return sendSuccess(res, { data: patient });
});

const assignNurses = asyncHandler(async (req, res) => {
  const patient = await patientService.assignNurses(
    req.patient._id,
    req.body.nurseUserIds,
    req.user
  );
  return sendSuccess(res, { data: patient });
});

const unassignNurse = asyncHandler(async (req, res) => {
  const patient = await patientService.unassignNurse(req.patient._id, req.params.nurseUserId);
  return sendSuccess(res, { data: patient });
});

const setPrimaryDoctor = asyncHandler(async (req, res) => {
  const patient = await patientService.setPrimaryDoctor(req.patient._id, req.body.doctorUserId);
  return sendSuccess(res, { data: patient });
});

const careTeam = asyncHandler(async (req, res) => {
  const team = await patientService.careTeam(req.patient._id);
  return sendSuccess(res, { data: team });
});

const discharge = asyncHandler(async (req, res) => {
  const patient = await patientService.discharge(req.patient._id, req.body);
  return sendSuccess(res, { data: patient });
});

module.exports = {
  list,
  caseload,
  ward,
  me,
  updateOwn,
  byMrn,
  getById,
  updateClinical,
  assignNurses,
  unassignNurse,
  setPrimaryDoctor,
  careTeam,
  discharge,
};

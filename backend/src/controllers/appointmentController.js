'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated, sendPage } = require('../utils/apiResponse');
const appointmentService = require('../services/appointmentService');

const book = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.book(req.body, req.user);
  return sendCreated(res, appointment);
});

const listMine = asyncHandler(async (req, res) => {
  const page = await appointmentService.listMine(req.user, req.query);
  return sendPage(res, page);
});

const listForPatient = asyncHandler(async (req, res) => {
  const page = await appointmentService.listForPatient(
    req.params.patientId,
    req.user,
    req.query
  );
  return sendPage(res, page);
});

const listForDoctor = asyncHandler(async (req, res) => {
  const page = await appointmentService.listForDoctor(req.params.userId, req.query);
  return sendPage(res, page);
});

const daySchedule = asyncHandler(async (req, res) => {
  const data = await appointmentService.daySchedule(req.params.userId, req.query.date);
  return sendSuccess(res, { data });
});

const getById = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.getById(req.params.id, req.user);
  return sendSuccess(res, { data: appointment });
});

const reschedule = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.reschedule(req.params.id, req.body, req.user);
  return sendSuccess(res, { data: appointment });
});

const confirm = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.confirm(req.params.id, req.user);
  return sendSuccess(res, { data: appointment });
});

const cancel = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.cancel(req.params.id, req.user, req.body.reason);
  return sendSuccess(res, { data: appointment });
});

const complete = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.complete(req.params.id, req.user, req.body.notes);
  return sendSuccess(res, { data: appointment });
});

const markNoShow = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.markNoShow(req.params.id, req.user);
  return sendSuccess(res, { data: appointment });
});

module.exports = {
  book,
  listMine,
  listForPatient,
  listForDoctor,
  daySchedule,
  getById,
  reschedule,
  confirm,
  cancel,
  complete,
  markNoShow,
};

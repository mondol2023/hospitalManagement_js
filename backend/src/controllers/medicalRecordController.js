'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated, sendPage } = require('../utils/apiResponse');
const medicalRecordService = require('../services/medicalRecordService');

/**
 * `req.patient` comes from `loadPatient`, which resolves the `me` alias — a
 * patient reading their own chart does not know their patient id, and the
 * service's own `_requirePatient` would reject the literal string.
 */

const chart = asyncHandler(async (req, res) => {
  const page = await medicalRecordService.chart(req.patient._id, req.user, req.query);
  return sendPage(res, page);
});

const latest = asyncHandler(async (req, res) => {
  const record = await medicalRecordService.latest(req.patient._id, req.user);
  return sendSuccess(res, { data: record });
});

const listForDoctor = asyncHandler(async (req, res) => {
  const page = await medicalRecordService.listForDoctor(
    req.params.doctorUserId,
    req.user,
    req.query
  );
  return sendPage(res, page);
});

const myRecords = asyncHandler(async (req, res) => {
  const page = await medicalRecordService.listForDoctor(req.user.id, req.user, req.query);
  return sendPage(res, page);
});

const getById = asyncHandler(async (req, res) => {
  const record = await medicalRecordService.getById(req.params.id, req.user);
  return sendSuccess(res, { data: record });
});

const create = asyncHandler(async (req, res) => {
  const record = await medicalRecordService.create(req.body, req.user);
  return sendCreated(res, record);
});

const update = asyncHandler(async (req, res) => {
  const record = await medicalRecordService.update(req.params.id, req.body, req.user);
  return sendSuccess(res, { data: record });
});

const remove = asyncHandler(async (req, res) => {
  const data = await medicalRecordService.remove(req.params.id, req.user);
  return sendSuccess(res, { data, message: 'Medical record deleted' });
});

const followUpsDue = asyncHandler(async (req, res) => {
  const data = await medicalRecordService.followUpsDue({ days: req.query.days });
  return sendSuccess(res, { data });
});

const sendFollowUpReminders = asyncHandler(async (req, res) => {
  const data = await medicalRecordService.sendFollowUpReminders({ days: req.query.days });
  return sendSuccess(res, { data, message: 'Follow-up reminders dispatched' });
});

module.exports = {
  chart,
  latest,
  listForDoctor,
  myRecords,
  getById,
  create,
  update,
  remove,
  followUpsDue,
  sendFollowUpReminders,
};

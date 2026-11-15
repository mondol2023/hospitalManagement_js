'use strict';

const asyncHandler = require('../utils/asyncHandler');
const handle = require('../utils/handle');
const { sendSuccess } = require('../utils/apiResponse');
const medicalRecordService = require('../services/medicalRecordService');

/**
 * patient` comes from `loadPatient`, which resolves the `me` alias — a patient reading their
 * own chart does not know their patient id, and the service's own `_requirePatient` would
 */

const chart = handle.page((req) =>
  medicalRecordService.chart(req.patient._id, req.user, req.query)
);

const latest = handle((req) => medicalRecordService.latest(req.patient._id, req.user));

const listForDoctor = handle.page((req) =>
  medicalRecordService.listForDoctor(
    req.params.doctorUserId,
    req.user,
    req.query
  )
);

const myRecords = handle.page((req) =>
  medicalRecordService.listForDoctor(req.user.id, req.user, req.query)
);

const addAttachments = handle.created((req) =>
  medicalRecordService.addAttachments(req.params.id, req.files, req.user)
);

const getById = handle((req) => medicalRecordService.getById(req.params.id, req.user));

const create = handle.created((req) => medicalRecordService.create(req.body, req.user));

const update = handle((req) => medicalRecordService.update(req.params.id, req.body, req.user));

const remove = asyncHandler(async (req, res) => {
  const data = await medicalRecordService.remove(req.params.id, req.user);
  return sendSuccess(res, { data, message: 'Medical record deleted' });
});

const followUpsDue = handle((req) => medicalRecordService.followUpsDue({ days: req.query.days }));

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
  addAttachments,
  remove,
  followUpsDue,
  sendFollowUpReminders,
};

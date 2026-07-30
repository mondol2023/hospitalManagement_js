'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendPage } = require('../utils/apiResponse');
const doctorService = require('../services/doctorService');

const list = asyncHandler(async (req, res) => {
  const page = await doctorService.list(req.query);
  return sendPage(res, page);
});

const specializations = asyncHandler(async (req, res) => {
  const data = await doctorService.specializations();
  return sendSuccess(res, { data });
});

const me = asyncHandler(async (req, res) => {
  const doctor = await doctorService.getByUser(req.user.id);
  return sendSuccess(res, { data: doctor });
});

const updateOwn = asyncHandler(async (req, res) => {
  const doctor = await doctorService.updateOwnProfile(req.user.id, req.body);
  return sendSuccess(res, { data: doctor });
});

const setDuty = asyncHandler(async (req, res) => {
  const doctor = await doctorService.setDuty(req.user.id, req.body.isOnDuty);
  return sendSuccess(res, { data: doctor });
});

const getByUser = asyncHandler(async (req, res) => {
  const doctor = await doctorService.getByUser(req.params.userId);
  return sendSuccess(res, { data: doctor });
});

/** Availability is keyed by the doctor's *user* id — appointments reference the user. */
const availability = asyncHandler(async (req, res) => {
  const data = await doctorService.availability(req.params.userId, req.query.date);
  return sendSuccess(res, { data });
});

const getById = asyncHandler(async (req, res) => {
  const doctor = await doctorService.getById(req.params.id);
  return sendSuccess(res, { data: doctor });
});

module.exports = { list, specializations, me, updateOwn, setDuty, getByUser, availability, getById };

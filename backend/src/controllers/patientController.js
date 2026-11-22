'use strict';

const handle = require('../utils/handle');
const patientService = require('../services/patientService');

/**
 * requireVisible` rather than through the `loadPatient` middleware: the service populates the
 * linked user account and applies the same visibility rule, so routing the read through it
 */

const list = handle.page((req) => patientService.list(req.query));

const caseload = handle.page((req) => patientService.caseload(req.user.id, req.query));

const ward = handle.page((req) => patientService.ward(req.params.ward, req.query));

const me = handle((req) => patientService.requireOwnRecord(req.user.id));

const updateOwn = handle((req) => patientService.updateOwnDetails(req.user.id, req.body));

const uploadAvatar = handle((req) => patientService.setAvatar(req.user.id, req.file));

const byMrn = handle((req) => patientService.findByMrn(req.params.mrn, req.user));

const getById = handle((req) => patientService.resolveForActor(req.user, req.params.patientId));

const updateClinical = handle((req) =>
  patientService.updateClinicalDetails(req.patient._id, req.body)
);

const assignNurses = handle((req) =>
  patientService.assignNurses(
    req.patient._id,
    req.body.nurseUserIds,
    req.user
  )
);

const unassignNurse = handle((req) =>
  patientService.unassignNurse(req.patient._id, req.params.nurseUserId)
);

const setPrimaryDoctor = handle((req) =>
  patientService.setPrimaryDoctor(req.patient._id, req.body.doctorUserId)
);

const careTeam = handle((req) => patientService.careTeamProfile(req.patient));

const myCareTeam = handle(async (req) =>
  patientService.careTeamProfile(await patientService.requireOwnRecord(req.user.id))
);

/**
 * The actor is passed through because releasing the bed is charted against whoever discharged
 * the patient; without it `bedService` skips the care-log entry and the ward is never told.
 */
const discharge = handle((req) => patientService.discharge(req.patient._id, req.body, req.user));

module.exports = {
  list,
  caseload,
  ward,
  me,
  updateOwn,
  uploadAvatar,
  byMrn,
  getById,
  updateClinical,
  assignNurses,
  unassignNurse,
  setPrimaryDoctor,
  careTeam,
  myCareTeam,
  discharge,
};

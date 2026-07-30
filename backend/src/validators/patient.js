'use strict';

const {
  z,
  objectId,
  objectIdOrSelf,
  listQuery,
  shortText,
  optionalText,
  longText,
  dateValue,
  boolish,
  nonEmptyPatch,
} = require('./common');
const { BLOOD_GROUPS, GENDERS } = require('../utils/constants');
const { patientProfile } = require('./profiles');

/**
 * Two distinct patch shapes, matching the two tiers in `patientService`:
 * `updateOwn` is what a patient may change about themselves, `updateClinical` is
 * what a clinician may change about the chart. They do not overlap — a patient
 * removing an allergy from their own record is exactly the edit this split
 * exists to prevent.
 */

const patientIdParam = z.object({ patientId: objectIdOrSelf });

const emergencyContact = patientProfile.shape.emergencyContact;

const list = {
  query: listQuery({
    search: z.string().trim().max(120).optional(),
    ward: shortText(60).optional(),
    isAdmitted: boolish.optional(),
    bloodGroup: z.enum(BLOOD_GROUPS).optional(),
  }),
};

const caseload = { query: listQuery() };

const ward = {
  params: z.object({ ward: shortText(60) }),
  query: listQuery(),
};

const byMrn = { params: z.object({ mrn: shortText(40) }) };

const byId = { params: patientIdParam };

const updateOwn = {
  body: nonEmptyPatch(
    z.object({
      address: optionalText(500),
      dateOfBirth: dateValue.optional(),
      emergencyContact: emergencyContact.optional(),
    })
  ),
};

const updateClinical = {
  params: patientIdParam,
  body: nonEmptyPatch(
    z.object({
      bloodGroup: z.enum(BLOOD_GROUPS).optional(),
      allergies: z.array(shortText(120)).max(50).optional(),
      chronicConditions: z.array(shortText(120)).max(50).optional(),
      medicalHistory: optionalText(5000),
      age: z.coerce.number().int().min(0).max(150).optional(),
      gender: z.enum(GENDERS).optional(),
      emergencyContact: emergencyContact.optional(),
    })
  ),
};

const assignNurses = {
  params: patientIdParam,
  body: z.object({ nurseUserIds: z.array(objectId).min(1).max(20) }),
};

const unassignNurse = {
  params: z.object({ patientId: objectIdOrSelf, nurseUserId: objectId }),
};

const setPrimaryDoctor = {
  params: patientIdParam,
  body: z.object({ doctorUserId: objectId }),
};

const discharge = {
  params: patientIdParam,
  body: z.object({ summary: longText(5000).optional() }),
};

module.exports = {
  list,
  caseload,
  ward,
  byMrn,
  byId,
  updateOwn,
  updateClinical,
  assignNurses,
  unassignNurse,
  setPrimaryDoctor,
  discharge,
};

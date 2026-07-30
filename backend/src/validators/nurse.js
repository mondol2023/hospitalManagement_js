'use strict';

const { z, objectId, idParam, listQuery, shortText, boolish, nonEmptyPatch } = require('./common');
const { nurseProfile } = require('./profiles');

/**
 * Two patch shapes on purpose. `updateOwn` is what a nurse may change about
 * themselves; ward assignment, grade and caseload ceiling are roster decisions
 * and live in `updateRoster`, behind an administrator. A nurse who could edit
 * `assignedWards` could grant themselves charting rights over any ward in the
 * hospital — `canWriteCareData` reads exactly that field.
 */
const updateOwn = {
  body: nonEmptyPatch(
    nurseProfile
      .pick({
        qualifications: true,
        licenseNumber: true,
        experienceInYears: true,
        department: true,
        shift: true,
      })
      .partial()
  ),
};

const updateRoster = {
  params: idParam(),
  body: nonEmptyPatch(
    nurseProfile
      .pick({ assignedWards: true, grade: true, supervisor: true, maxPatients: true })
      .partial()
  ),
};

const list = {
  query: listQuery({
    search: z.string().trim().max(120).optional(),
    ward: shortText(60).optional(),
    grade: nurseProfile.shape.grade,
    onDuty: boolish.optional(),
  }),
};

const byUser = { params: z.object({ userId: objectId }) };

const wardParam = { params: z.object({ ward: shortText(60) }) };

const setDuty = { body: z.object({ isOnDuty: z.boolean() }) };

module.exports = { list, byUser, wardParam, updateOwn, updateRoster, setDuty };

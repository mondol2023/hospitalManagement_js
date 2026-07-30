'use strict';

const { z, objectId, idParam, listQuery, nonEmptyPatch } = require('./common');
const { STAFF_ROLES } = require('../utils/constants');
const { staffProfile } = require('./profiles');

/**
 * `salaryCents` appears only in `updateEmployment`, never in `updateOwn` — pay
 * is set by whoever administers employment, not by the employee.
 */
const updateOwn = {
  body: nonEmptyPatch(staffProfile.pick({ department: true, shift: true, notes: true }).partial()),
};

const updateEmployment = {
  params: idParam(),
  body: nonEmptyPatch(
    staffProfile
      .pick({
        designation: true,
        employmentType: true,
        reportsTo: true,
        salaryCents: true,
        department: true,
      })
      .partial()
  ),
};

const list = {
  query: listQuery({
    search: z.string().trim().max(120).optional(),
    role: z.enum(STAFF_ROLES).optional(),
    department: z.string().trim().max(120).optional(),
  }),
};

const byUser = { params: z.object({ userId: objectId }) };

const setDuty = { body: z.object({ isOnDuty: z.boolean() }) };

module.exports = { list, byUser, updateOwn, updateEmployment, setDuty };

'use strict';

const {
  z,
  objectId,
  idParam,
  listQuery,
  dateValue,
  boolish,
  rosterStatus,
  nonEmptyPatch,
} = require('./common');
const { doctorProfile } = require('./profiles');

/**
 * The self-service patch is the creation shape minus the fields only HR may set
 * (`employeeId`) and made partial. Deriving it with `.omit().partial()` rather
 * than retyping the fields is what keeps a new field on the profile from being
 * silently unpatchable — or, worse, patchable when it should not be.
 */
const updateOwn = {
  body: nonEmptyPatch(doctorProfile.omit({ employeeId: true }).partial()),
};

/**
 * Employment is what an administrator controls about a doctor: where they work,
 * when, and whether they take new patients. Clinical fields stay in `updateOwn`.
 * Unknown keys are stripped by zod, so a fee sent here is dropped, not applied.
 */
const updateEmployment = {
  params: idParam(),
  body: nonEmptyPatch(
    doctorProfile.pick({ department: true, shift: true, isAcceptingPatients: true }).partial()
  ),
};

const list = {
  query: listQuery({
    search: z.string().trim().max(120).optional(),
    specialization: z.string().trim().max(120).optional(),
    department: z.string().trim().max(120).optional(),
    status: rosterStatus.optional(),
    accepting: boolish.optional(),
  }),
};

const byId = { params: idParam() };

const byUser = { params: z.object({ userId: objectId }) };

const availability = {
  params: z.object({ userId: objectId }),
  query: z.object({ date: dateValue.optional() }),
};

const setDuty = { body: z.object({ isOnDuty: z.boolean() }) };

module.exports = { list, byId, byUser, updateOwn, updateEmployment, availability, setDuty };

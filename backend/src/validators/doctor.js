'use strict';

const { z, objectId, idParam, listQuery, dateValue, nonEmptyPatch } = require('./common');
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

const list = {
  query: listQuery({
    search: z.string().trim().max(120).optional(),
    specialization: z.string().trim().max(120).optional(),
    department: z.string().trim().max(120).optional(),
  }),
};

const byId = { params: idParam() };

const byUser = { params: z.object({ userId: objectId }) };

const availability = {
  params: z.object({ userId: objectId }),
  query: z.object({ date: dateValue.optional() }),
};

const setDuty = { body: z.object({ isOnDuty: z.boolean() }) };

module.exports = { list, byId, byUser, updateOwn, availability, setDuty };

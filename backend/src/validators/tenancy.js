'use strict';

const { z, idParam, listQuery, shortText, optionalText, boolish, nonEmptyPatch, objectId } = require('./common');
const { email, phone, password } = require('./auth');
const {
  ORGANIZATION_STATUS_VALUES,
  ORGANIZATION_PLAN_VALUES,
  BRANCH_TYPE_VALUES,
  DEPARTMENT_TYPE_VALUES,
} = require('../utils/constants');

const code = (min, max) => z.string().trim().toUpperCase().min(min).max(max);
const subdomain = z.string().trim().toLowerCase().min(2).max(40);

// --- platform ---------------------------------------------------------------

const createOrganization = {
  body: z.object({
    name: shortText(160),
    code: code(2, 8),
    subdomain: subdomain.optional(),
    plan: z.enum(ORGANIZATION_PLAN_VALUES).optional(),
    country: shortText(2).optional(),
    timezone: shortText(64).optional(),
    currency: shortText(3).optional(),
    locale: shortText(10).optional(),
    admin: z.object({ name: shortText(120), email, password }),
    headOfficeBranch: z.object({ name: shortText(160), code: code(2, 16) }).optional(),
  }),
};

const listOrganizations = {
  query: listQuery({
    search: z.string().trim().max(120).optional(),
    status: z.enum(ORGANIZATION_STATUS_VALUES).optional(),
  }),
};

const updateOrganization = {
  params: idParam(),
  body: nonEmptyPatch(
    z.object({
      status: z.enum(ORGANIZATION_STATUS_VALUES).optional(),
      plan: z.enum(ORGANIZATION_PLAN_VALUES).optional(),
      subdomain: subdomain.optional(),
    })
  ),
};

// --- own organisation -------------------------------------------------------

const updateOwnOrganization = {
  body: nonEmptyPatch(
    z.object({
      name: shortText(160).optional(),
      timezone: shortText(64).optional(),
      locale: shortText(10).optional(),
      country: shortText(2).optional(),
      currency: shortText(3).optional(),
    })
  ),
};

// --- branches ---------------------------------------------------------------

const branchFields = {
  name: shortText(160),
  type: z.enum(BRANCH_TYPE_VALUES),
  address: optionalText(500),
  phone: phone.optional(),
  timezone: shortText(64).optional(),
};

const listBranches = { query: listQuery({ isActive: boolish.optional() }) };

const createBranch = { body: z.object({ ...branchFields, code: code(2, 16), type: branchFields.type.optional() }) };

const updateBranch = {
  params: idParam(),
  body: nonEmptyPatch(
    z.object({
      name: branchFields.name.optional(),
      type: branchFields.type.optional(),
      address: branchFields.address,
      phone: branchFields.phone,
      timezone: branchFields.timezone,
      isActive: z.boolean().optional(),
    })
  ),
};

// --- departments ------------------------------------------------------------

const listDepartments = {
  query: listQuery({ branch: objectId.optional(), isActive: boolish.optional() }),
};

const createDepartment = {
  body: z.object({
    branch: objectId,
    name: shortText(160),
    code: code(2, 16),
    type: z.enum(DEPARTMENT_TYPE_VALUES).optional(),
    head: objectId.optional(),
    costCenter: shortText(64).optional(),
  }),
};

const updateDepartment = {
  params: idParam(),
  body: nonEmptyPatch(
    z.object({
      name: shortText(160).optional(),
      type: z.enum(DEPARTMENT_TYPE_VALUES).optional(),
      head: objectId.optional(),
      costCenter: shortText(64).optional(),
      isActive: z.boolean().optional(),
    })
  ),
};

module.exports = {
  createOrganization,
  listOrganizations,
  updateOrganization,
  updateOwnOrganization,
  listBranches,
  createBranch,
  updateBranch,
  listDepartments,
  createDepartment,
  updateDepartment,
};

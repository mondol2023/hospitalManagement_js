'use strict';

const mongoose = require('mongoose');
const context = require('../../src/utils/context');
const { Organization, Branch } = require('../../src/models');

/** Fixed ids so the test default store and fixtures agree without lookups. */
const TEST_ORG_ID = new mongoose.Types.ObjectId('64b000000000000000000001');
const TEST_BRANCH_ID = new mongoose.Types.ObjectId('64b000000000000000000002');

const withoutTenant = (fn) => context.withoutTenant('test:setup', fn);

/** Upserts the default tenant and installs it as the context fallback. */
async function ensureDefaultTenant() {
  const { organization, branch } = await withoutTenant(async () => {
    const org = await Organization.findOneAndUpdate(
      { _id: TEST_ORG_ID },
      { $setOnInsert: { name: 'Test Organization', code: 'TEST' } },
      { upsert: true, new: true }
    );
    const br = await Branch.findOneAndUpdate(
      { _id: TEST_BRANCH_ID },
      { $setOnInsert: { organization: TEST_ORG_ID, name: 'Main', code: 'MAIN' } },
      { upsert: true, new: true }
    );
    org.defaultRegistrationBranch = br._id;
    await org.save();
    return { organization: org, branch: br };
  });

  context.setTestDefault({
    source: 'script',
    organizationId: TEST_ORG_ID,
    branchId: TEST_BRANCH_ID,
    branchIds: [TEST_BRANCH_ID],
    canReadAllBranches: true,
  });
  return { organization, branch };
}

let tenantSeq = 0;

/** A second, isolated tenant. `store` is ready for `context.run`. */
async function makeTenant({ code, subdomain } = {}) {
  tenantSeq += 1;
  const suffix = `${Date.now().toString(36)}${tenantSeq}`.toUpperCase().slice(-6);
  const { organization, branch } = await withoutTenant(async () => {
    const org = await Organization.create({
      name: `Tenant ${suffix}`,
      code: code || `T${suffix}`,
      ...(subdomain ? { subdomain } : {}),
    });
    const br = await Branch.create({ organization: org._id, name: 'Main', code: 'MAIN' });
    org.defaultRegistrationBranch = br._id;
    await org.save();
    return { organization: org, branch: br };
  });

  const store = {
    source: 'script',
    organizationId: organization._id,
    branchId: branch._id,
    branchIds: [branch._id],
    canReadAllBranches: true,
  };
  return { organization, branch, store };
}

module.exports = { TEST_ORG_ID, TEST_BRANCH_ID, ensureDefaultTenant, makeTenant };

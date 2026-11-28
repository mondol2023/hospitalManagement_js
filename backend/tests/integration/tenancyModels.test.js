'use strict';

const mongoose = require('mongoose');
const context = require('../../src/utils/context');
const { Organization, Branch, Department } = require('../../src/models');

const { ObjectId } = mongoose.Types;
const orgA = new ObjectId();
const orgB = new ObjectId();
const inOrg = (organizationId, fn) => context.run({ organizationId, source: 'script' }, fn);

const validOrg = (over = {}) => ({ name: 'Acme', code: 'ACME', ...over });

describe('Organization', () => {
  it('uppercases the code and rejects lengths outside 2-8', async () => {
    const org = await Organization.create(validOrg({ code: 'abc' }));
    expect(org.code).toBe('ABC');
    await expect(Organization.create(validOrg({ code: 'A' }))).rejects.toThrow(/code/);
    await expect(Organization.create(validOrg({ code: 'ABCDEFGHI' }))).rejects.toThrow(/code/);
  });

  it('applies the documented defaults', async () => {
    const org = await Organization.create(validOrg());
    expect(org).toMatchObject({
      status: 'trial',
      country: 'BD',
      timezone: 'Asia/Dhaka',
      currency: 'BDT',
      locale: 'en',
    });
  });

  it('code cannot be changed by save or findOneAndUpdate', async () => {
    const org = await Organization.create(validOrg());
    org.code = 'CHANGED';
    await org.save();
    await Organization.findOneAndUpdate({ _id: org._id }, { $set: { code: 'OTHER' } });
    const fresh = await Organization.findById(org._id);
    expect(fresh.code).toBe('ACME');
  });

  it('rejects a duplicate code', async () => {
    await Organization.create(validOrg());
    await expect(Organization.create(validOrg({ name: 'Other' }))).rejects.toThrow(/duplicate key/);
  });

  it('subdomain: lowercases, rejects bad chars and each reserved name, allows two orgs with none', async () => {
    const org = await Organization.create(validOrg({ subdomain: 'LeBl' }));
    expect(org.subdomain).toBe('lebl');
    await expect(Organization.create(validOrg({ code: 'B1', subdomain: 'bad_name' }))).rejects.toThrow(/subdomain/);
    await expect(Organization.create(validOrg({ code: 'B2', subdomain: 'a' }))).rejects.toThrow(/subdomain/);
    for (const reserved of ['www', 'api', 'app', 'admin', 'platform']) {
      await expect(Organization.create(validOrg({ code: 'B3', subdomain: reserved }))).rejects.toThrow(/reserved|subdomain/);
    }
    await Organization.create(validOrg({ code: 'N1' }));
    await Organization.create(validOrg({ code: 'N2' }));
    await expect(Organization.create(validOrg({ code: 'N3', subdomain: 'lebl' }))).rejects.toThrow(/duplicate key/);
  });
});

describe('Branch', () => {
  const branch = (over = {}) => ({ name: 'Main', code: 'MAIN', ...over });

  it('stamps the organization from context', async () => {
    const b = await inOrg(orgA, () => Branch.create(branch()));
    expect(String(b.organization)).toBe(String(orgA));
    expect(b.isActive).toBe(true);
  });

  it('two branches may share a code across organisations but not within one', async () => {
    await inOrg(orgA, () => Branch.create(branch()));
    await inOrg(orgB, () => Branch.create(branch()));
    await expect(inOrg(orgA, () => Branch.create(branch({ name: 'Dup' })))).rejects.toThrow(/duplicate key/);
  });

  it('code is immutable', async () => {
    const b = await inOrg(orgA, () => Branch.create(branch()));
    await inOrg(orgA, async () => {
      await Branch.findOneAndUpdate({ _id: b._id }, { $set: { code: 'ZZ' } });
      expect((await Branch.findById(b._id)).code).toBe('MAIN');
    });
  });

  it('rejects an unknown type', async () => {
    await expect(inOrg(orgA, () => Branch.create(branch({ type: 'spa' })))).rejects.toThrow(/type/);
  });
});

describe('Department', () => {
  const branchId = new ObjectId();
  const dept = (over = {}) => ({ name: 'Cardiology', code: 'CARD', branch: branchId, ...over });

  it('Department unique on { organization, branch, code }', async () => {
    await inOrg(orgA, () => Department.create(dept()));
    await expect(inOrg(orgA, () => Department.create(dept({ name: 'Dup' })))).rejects.toThrow(/duplicate key/);
    await inOrg(orgA, () => Department.create(dept({ branch: new ObjectId() })));
    await inOrg(orgB, () => Department.create(dept()));
  });

  it('requires a branch and a valid type', async () => {
    await expect(inOrg(orgA, () => Department.create(dept({ branch: undefined })))).rejects.toThrow(/branch/);
    await expect(inOrg(orgA, () => Department.create(dept({ type: 'bogus' })))).rejects.toThrow(/type/);
  });
});

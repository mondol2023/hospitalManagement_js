'use strict';

const mongoose = require('mongoose');
const context = require('../../src/utils/context');
const { TenantContextMissingError, TenantViolationError } = require('../../src/utils/tenantErrors');
const tenantScoped = require('../../src/models/plugins/tenantScoped');

const { ObjectId } = mongoose.Types;

const branchSchema = new mongoose.Schema({ name: String, qty: Number });
branchSchema.plugin(tenantScoped, { scope: 'branch' });
const BranchProbe = mongoose.model('ProbeBranch', branchSchema);

const orgSchema = new mongoose.Schema({ name: String, platform: Boolean });
orgSchema.plugin(tenantScoped, {
  scope: 'organization',
  optionalWhen: (doc) => doc.platform === true,
});
const OrgProbe = mongoose.model('ProbeOrg', orgSchema);

const geoSchema = new mongoose.Schema({
  name: String,
  loc: { type: { type: String, enum: ['Point'] }, coordinates: [Number] },
});
geoSchema.index({ loc: '2dsphere' });
geoSchema.plugin(tenantScoped, { scope: 'organization' });
const GeoProbe = mongoose.model('ProbeGeo', geoSchema);

const idA = new ObjectId();
const idB = new ObjectId();
const b1 = new ObjectId(); // org A, active branch
const b2 = new ObjectId(); // org A, second branch
const b9 = new ObjectId(); // org B

const A = { organizationId: idA, branchId: b1, source: 'http' };
const A2 = { organizationId: idA, branchId: b2, source: 'http' };
const B = { organizationId: idB, branchId: b9, source: 'http' };

const inCtx = (store, fn) => context.run(store, fn);
// `await` inside the scope: a bare Query would only run when awaited outside it.
const raw = (fn) =>
  context.withoutTenant('test inspection', async () => {
    const result = await fn();
    return result;
  });
const names = (docs) => docs.map((d) => d.name).sort();

async function seed() {
  await inCtx(A, () => BranchProbe.create([{ name: 'a1' }, { name: 'a-dup' }]));
  await inCtx(A2, () => BranchProbe.create({ name: 'a2' }));
  await inCtx(B, () => BranchProbe.create({ name: 'b', qty: 1 }));
}

describe('tenantScoped plugin', () => {
  beforeEach(() => context.clearTestDefault());

  it('stamps organization and branch on create', async () => {
    await inCtx(A, async () => {
      const doc = await BranchProbe.create({ name: 'x' });
      expect(String(doc.organization)).toBe(String(idA));
      expect(String(doc.branch)).toBe(String(b1));
      const org = await OrgProbe.create({ name: 'y' });
      expect(String(org.organization)).toBe(String(idA));
      expect(org.branch).toBeUndefined();
    });
  });

  it('find, findOne, countDocuments, distinct only see own tenant', async () => {
    await seed();
    await inCtx(A, async () => {
      expect(names(await BranchProbe.find())).toEqual(['a-dup', 'a1']);
      expect(await BranchProbe.findOne({ name: 'b' })).toBeNull();
      expect(await BranchProbe.countDocuments({})).toBe(2);
      expect((await BranchProbe.distinct('name')).sort()).toEqual(['a-dup', 'a1']);
      // A caller's own organization condition cannot widen the injected one.
      expect(await BranchProbe.find({ organization: idB })).toEqual([]);
      expect(await BranchProbe.find({ $or: [{ organization: idB }, { name: 'b' }] })).toEqual([]);
    });
  });

  it('findOneAndUpdate/updateOne/updateMany/deleteOne/deleteMany cannot touch another tenant', async () => {
    await seed();
    await inCtx(A, async () => {
      expect(await BranchProbe.findOneAndUpdate({ name: 'b' }, { $set: { qty: 9 } })).toBeNull();
      expect((await BranchProbe.updateOne({ name: 'b' }, { $set: { qty: 9 } })).modifiedCount).toBe(0);
      expect((await BranchProbe.updateMany({}, { $set: { qty: 9 } }, {})).modifiedCount).toBe(2);
      expect((await BranchProbe.deleteOne({ name: 'b' })).deletedCount).toBe(0);
      expect((await BranchProbe.deleteMany({ name: 'b' })).deletedCount).toBe(0);
      expect(await BranchProbe.findOneAndDelete({ name: 'b' })).toBeNull();
    });
    const other = await raw(() => BranchProbe.findOne({ name: 'b' }));
    expect(other.qty).toBe(1);
  });

  it('replaceOne and findOneAndReplace keep the tenant stamp and cannot cross tenants', async () => {
    await seed();
    await inCtx(A, async () => {
      expect((await BranchProbe.replaceOne({ name: 'b' }, { name: 'z' })).modifiedCount).toBe(0);
      expect(await BranchProbe.findOneAndReplace({ name: 'b' }, { name: 'z' })).toBeNull();
      await BranchProbe.replaceOne({ name: 'a1' }, { name: 'a1-new' });
      const replaced = await BranchProbe.findOne({ name: 'a1-new' });
      expect(String(replaced.organization)).toBe(String(idA));
      expect(String(replaced.branch)).toBe(String(b1));
      await expect(
        BranchProbe.replaceOne({ name: 'a-dup' }, { name: 'q', organization: idB })
      ).rejects.toBeInstanceOf(TenantViolationError);
    });
    expect(await raw(() => BranchProbe.countDocuments({ name: 'b' }))).toBe(1);
  });

  it('aggregate prepends $match; $geoNear stays first with $match second', async () => {
    await seed();
    await inCtx(A, async () => {
      const agg = BranchProbe.aggregate([{ $group: { _id: '$name', n: { $sum: 1 } } }]);
      const rows = await agg.exec();
      expect(rows.map((r) => r._id).sort()).toEqual(['a-dup', 'a1']);
      expect(Object.keys(agg.pipeline()[0])).toEqual(['$match']);
    });

    await GeoProbe.createIndexes();
    await inCtx(A, () => GeoProbe.create({ name: 'ga', loc: { type: 'Point', coordinates: [0, 0] } }));
    await inCtx(B, () => GeoProbe.create({ name: 'gb', loc: { type: 'Point', coordinates: [0, 0] } }));
    await inCtx(A, async () => {
      const agg = GeoProbe.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [0, 0] },
            distanceField: 'dist',
            spherical: true,
          },
        },
      ]);
      const rows = await agg.exec();
      expect(rows.map((r) => r.name)).toEqual(['ga']);
      const [first, second] = agg.pipeline();
      expect(Object.keys(first)).toEqual(['$geoNear']);
      expect(Object.keys(second)).toEqual(['$match']);
    });
  });

  it('aggregate rejects $out and $merge on scoped models', async () => {
    await inCtx(A, async () => {
      await expect(
        BranchProbe.aggregate([{ $match: {} }, { $out: 'leak' }]).exec()
      ).rejects.toBeInstanceOf(TenantViolationError);
      await expect(
        BranchProbe.aggregate([{ $merge: { into: 'leak' } }]).exec()
      ).rejects.toBeInstanceOf(TenantViolationError);
    });
  });

  it('estimatedDocumentCount throws on scoped models', async () => {
    await inCtx(A, async () => {
      await expect(BranchProbe.estimatedDocumentCount()).rejects.toBeInstanceOf(TenantViolationError);
    });
  });

  it('throws TenantContextMissingError with no store and no bypass', async () => {
    await expect(BranchProbe.find().exec()).rejects.toBeInstanceOf(TenantContextMissingError);
    await expect(BranchProbe.countDocuments({}).exec()).rejects.toBeInstanceOf(
      TenantContextMissingError
    );
    await expect(BranchProbe.aggregate([{ $match: {} }]).exec()).rejects.toBeInstanceOf(
      TenantContextMissingError
    );
    await expect(BranchProbe.create({ name: 'x' })).rejects.toBeInstanceOf(
      TenantContextMissingError
    );
    await expect(BranchProbe.insertMany([{ name: 'x' }])).rejects.toBeInstanceOf(
      TenantContextMissingError
    );
    await expect(
      BranchProbe.bulkWrite([{ insertOne: { document: { name: 'x' } } }])
    ).rejects.toBeInstanceOf(TenantContextMissingError);
  });

  it('store without organizationId throws', async () => {
    await inCtx({ branchId: b1, source: 'http' }, async () => {
      await expect(BranchProbe.find().exec()).rejects.toBeInstanceOf(TenantContextMissingError);
      await expect(BranchProbe.create({ name: 'x' })).rejects.toBeInstanceOf(
        TenantContextMissingError
      );
    });
  });

  it('branch-scoped read without a branch in the store throws unless reading all branches', async () => {
    await inCtx({ organizationId: idA, source: 'http' }, async () => {
      await expect(BranchProbe.find().exec()).rejects.toBeInstanceOf(TenantContextMissingError);
      await expect(OrgProbe.find().exec()).resolves.toEqual([]);
    });
  });

  it('withoutTenant bypasses injection', async () => {
    await seed();
    const all = await raw(() => BranchProbe.find());
    expect(names(all)).toEqual(['a-dup', 'a1', 'a2', 'b']);
    // Bypass skips stamping too, so the caller must name the tenant itself.
    await expect(raw(() => BranchProbe.create({ name: 'n' }))).rejects.toMatchObject({
      name: 'ValidationError',
    });
    const made = await raw(() =>
      BranchProbe.create({ name: 'n', organization: idA, branch: b1 })
    );
    expect(String(made.organization)).toBe(String(idA));
  });

  it('rejects a document whose organization differs from the store', async () => {
    await inCtx(A, async () => {
      await expect(BranchProbe.create({ name: 'x', organization: idB })).rejects.toBeInstanceOf(
        TenantViolationError
      );
      await expect(
        BranchProbe.insertMany([{ name: 'x', organization: idB, branch: b9 }])
      ).rejects.toBeInstanceOf(TenantViolationError);
    });
  });

  it('rejects an update that sets organization or branch', async () => {
    await seed();
    await inCtx(A, async () => {
      await expect(
        BranchProbe.updateOne({ name: 'a1' }, { $set: { organization: idB } })
      ).rejects.toBeInstanceOf(TenantViolationError);
      await expect(
        BranchProbe.findOneAndUpdate({ name: 'a1' }, { organization: idB })
      ).rejects.toBeInstanceOf(TenantViolationError);
      await expect(
        BranchProbe.updateMany({}, { $set: { branch: b9 } })
      ).rejects.toBeInstanceOf(TenantViolationError);
      await expect(
        BranchProbe.updateOne({ name: 'a1' }, { $setOnInsert: { branch: b9 } }, { upsert: true })
      ).rejects.toBeInstanceOf(TenantViolationError);
      await expect(
        BranchProbe.updateOne({ name: 'a1' }, [{ $set: { organization: idB } }])
      ).rejects.toBeInstanceOf(TenantViolationError);
    });
  });

  it('insertMany and bulkWrite are stamped and filtered', async () => {
    await seed();
    await inCtx(A, async () => {
      const docs = await BranchProbe.insertMany([{ name: 'i1' }, { name: 'i2' }]);
      expect(docs.every((d) => String(d.organization) === String(idA))).toBe(true);
      expect(docs.every((d) => String(d.branch) === String(b1))).toBe(true);

      await BranchProbe.bulkWrite([
        { insertOne: { document: { name: 'bw' } } },
        { updateOne: { filter: { name: 'b' }, update: { $set: { qty: 5 } } } },
        { updateMany: { filter: { name: 'b' }, update: { $set: { qty: 5 } } } },
        { replaceOne: { filter: { name: 'b' }, replacement: { name: 'zz' } } },
        { deleteOne: { filter: { name: 'b' } } },
        { deleteMany: { filter: { name: 'b' } } },
      ]);
      const bw = await BranchProbe.findOne({ name: 'bw' });
      expect(String(bw.organization)).toBe(String(idA));
      expect(String(bw.branch)).toBe(String(b1));

      await expect(
        BranchProbe.bulkWrite([{ insertOne: { document: { name: 'x', organization: idB } } }])
      ).rejects.toBeInstanceOf(TenantViolationError);
      await expect(
        BranchProbe.bulkWrite([
          { updateOne: { filter: {}, update: { $set: { organization: idB } } } },
        ])
      ).rejects.toBeInstanceOf(TenantViolationError);
    });
    const other = await raw(() => BranchProbe.find({ organization: idB }));
    expect(other).toHaveLength(1);
    expect(other[0].name).toBe('b');
    expect(other[0].qty).toBe(1);
  });

  it('branches: all is honoured only with canReadAllBranches', async () => {
    await seed();
    // Without the flag, the option is ignored.
    await inCtx(A, async () => {
      expect(await BranchProbe.find().setOptions({ branches: 'all' })).toHaveLength(2);
      const agg = BranchProbe.aggregate([{ $project: { name: 1 } }]).option({ branches: 'all' });
      expect(await agg.exec()).toHaveLength(2);
    });
    // With it, the query and the aggregate widen to the whole organisation.
    await inCtx({ ...A, canReadAllBranches: true }, async () => {
      expect(await BranchProbe.find()).toHaveLength(2);
      const q = BranchProbe.find().setOptions({ branches: 'all' });
      expect(names(await q.exec())).toEqual(['a-dup', 'a1', 'a2']);
      expect(q.getOptions().branches).toBeUndefined();

      const agg = BranchProbe.aggregate([{ $project: { name: 1 } }]).option({ branches: 'all' });
      expect(await agg.exec()).toHaveLength(3);
      expect(agg.options.branches).toBeUndefined();
      expect(await BranchProbe.countDocuments({}).setOptions({ branches: 'all' })).toBe(3);
    });
  });

  it('defaultBranchRead all widens reads without an option', async () => {
    await seed();
    await inCtx({ ...A, defaultBranchRead: 'all' }, async () => {
      expect(names(await BranchProbe.find())).toEqual(['a-dup', 'a1', 'a2']);
      expect(await BranchProbe.aggregate([{ $project: { name: 1 } }]).exec()).toHaveLength(3);
    });
  });

  it('branch override honoured for source job, ignored for source http', async () => {
    await seed();
    await inCtx({ ...A, source: 'job' }, async () => {
      expect(names(await BranchProbe.find().setOptions({ branch: b2 }))).toEqual(['a2']);
      expect(names(await BranchProbe.forBranch(b2).find())).toEqual(['a2']);
      expect(await BranchProbe.forBranch(b2).countDocuments({})).toBe(1);
      expect((await BranchProbe.forBranch(b2).findOne({})).name).toBe('a2');
    });
    await inCtx({ ...A, source: 'script' }, async () => {
      expect(names(await BranchProbe.forBranch(b2).find())).toEqual(['a2']);
    });
    await inCtx(A, async () => {
      expect(names(await BranchProbe.find().setOptions({ branch: b2 }))).toEqual(['a-dup', 'a1']);
      expect(names(await BranchProbe.forBranch(b2).find())).toEqual(['a-dup', 'a1']);
    });
  });

  it('optionalWhen lets a document be saved without organization', async () => {
    await inCtx(A, async () => {
      const platform = await OrgProbe.create({ name: 'p', platform: true });
      expect(platform.organization).toBeUndefined();
      const tenanted = await OrgProbe.create({ name: 't' });
      expect(String(tenanted.organization)).toBe(String(idA));
    });
    // No store at all: a platform-level document still saves.
    const loose = await OrgProbe.create({ name: 'p2', platform: true });
    expect(loose.organization).toBeUndefined();
    // And ordinary tenant queries never see it.
    await inCtx(A, async () => {
      expect(names(await OrgProbe.find())).toEqual(['t']);
    });
  });

  it('exposes tenantFields per scope', () => {
    expect(BranchProbe.tenantFields()).toEqual(['organization', 'branch']);
    expect(OrgProbe.tenantFields()).toEqual(['organization']);
  });
});

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { mongoose } = require('../../src/config/database');
const { createRunner } = require('../../scripts/lib/migrationRunner');

const silent = { info() {}, warn() {}, error() {} };

function writeMigration(dir, name, { up, down }) {
  fs.writeFileSync(
    path.join(dir, name),
    `'use strict';
module.exports = {
  async up({ db }) { ${up} },
  async down({ db }) { ${down} },
};
`,
  );
}

describe('migration runner', () => {
  let dir;
  let db;
  let runner;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'));
    db = mongoose.connection.db;
    runner = createRunner({ db, dir, log: silent });
    writeMigration(dir, '001-first.js', {
      up: "await db.collection('mig_marks').insertOne({ _id: 'first' });",
      down: "await db.collection('mig_marks').deleteOne({ _id: 'first' });",
    });
    writeMigration(dir, '002-second.js', {
      up: "await db.collection('mig_marks').insertOne({ _id: 'second' });",
      down: "await db.collection('mig_marks').deleteOne({ _id: 'second' });",
    });
  });

  afterEach(async () => {
    fs.rmSync(dir, { recursive: true, force: true });
    await db.collection('mig_marks').deleteMany({});
    await db.collection('migrations').deleteMany({});
  });

  it('up applies pending migrations in order and records them', async () => {
    expect(await runner.up()).toEqual(['001-first.js', '002-second.js']);

    const recorded = await db.collection('migrations').find().sort({ appliedAt: 1 }).toArray();
    expect(recorded.map((r) => r.name)).toEqual(['001-first.js', '002-second.js']);
    expect(recorded[0].appliedAt).toBeInstanceOf(Date);
    expect(typeof recorded[0].durationMs).toBe('number');
    expect(await db.collection('mig_marks').countDocuments()).toBe(2);
  });

  it('up twice applies nothing the second time', async () => {
    await runner.up();
    expect(await runner.up()).toEqual([]);
    expect(await db.collection('mig_marks').countDocuments()).toBe(2);
  });

  it('down reverts only the latest and removes its record', async () => {
    await runner.up();

    expect(await runner.down()).toBe('002-second.js');

    expect(await db.collection('mig_marks').find().toArray()).toEqual([{ _id: 'first' }]);
    const recorded = await db.collection('migrations').find().toArray();
    expect(recorded.map((r) => r.name)).toEqual(['001-first.js']);
  });

  it('down returns null when nothing is applied', async () => {
    expect(await runner.down()).toBeNull();
  });

  it('a throwing migration is not recorded and later ones do not run', async () => {
    writeMigration(dir, '001-first.js', { up: "throw new Error('boom');", down: '' });

    await expect(runner.up()).rejects.toThrow('boom');

    expect(await db.collection('migrations').countDocuments()).toBe(0);
    expect(await db.collection('mig_marks').countDocuments()).toBe(0);
  });

  it('status lists applied migrations with timestamps', async () => {
    await runner.up();

    const status = await runner.status();

    expect(status.map((s) => s.name)).toEqual(['001-first.js', '002-second.js']);
    expect(status[0].appliedAt).toBeInstanceOf(Date);
  });
});

'use strict';

const fs = require('fs');
const path = require('path');

const COLLECTION = 'migrations';

/**
 * Minimal forward/backward migration runner over the raw driver.
 *
 * Migrations are files in `dir`, applied in filename order. Each exports
 * `{ up({ db, log }), down({ db, log }) }`. A migration is recorded only after
 * its `up` resolves, so a throwing one is retried on the next run and nothing
 * after it runs. Deliberately no Mongoose models: migrations must keep working
 * after the schemas they predate have changed.
 */
function createRunner({ db, dir, log = console }) {
  const records = () => db.collection(COLLECTION);

  function listFiles() {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.js'))
      .sort();
  }

  function load(name) {
    return require(path.join(dir, name));
  }

  async function appliedNames() {
    const rows = await records().find({}, { projection: { name: 1 } }).toArray();
    return new Set(rows.map((r) => r.name));
  }

  async function up() {
    const applied = await appliedNames();
    const ran = [];
    for (const name of listFiles()) {
      if (applied.has(name)) continue;
      const started = Date.now();
      log.info(`migrate up: ${name}`);
      await load(name).up({ db, log });
      await records().insertOne({ name, appliedAt: new Date(), durationMs: Date.now() - started });
      ran.push(name);
    }
    return ran;
  }

  async function down() {
    const [latest] = await records().find().sort({ appliedAt: -1, name: -1 }).limit(1).toArray();
    if (!latest) return null;
    log.info(`migrate down: ${latest.name}`);
    await load(latest.name).down({ db, log });
    await records().deleteOne({ name: latest.name });
    return latest.name;
  }

  async function status() {
    const rows = await records().find().sort({ name: 1 }).toArray();
    return rows.map(({ name, appliedAt }) => ({ name, appliedAt }));
  }

  return { up, down, status };
}

module.exports = { createRunner };

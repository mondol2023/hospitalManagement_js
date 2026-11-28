'use strict';
/* eslint-disable no-console -- CLI entry point: stdout is its interface */

const path = require('path');
const { connectDatabase, disconnectDatabase, mongoose } = require('../src/config/database');
const logger = require('../src/config/logger');
const { createRunner } = require('./lib/migrationRunner');

const COMMANDS = ['up', 'down', 'status'];

async function main() {
  const command = process.argv[2];
  if (!COMMANDS.includes(command)) {
    console.error(`Usage: node scripts/migrate.js ${COMMANDS.join('|')}`);
    process.exitCode = 1;
    return;
  }

  await connectDatabase();
  const runner = createRunner({
    db: mongoose.connection.db,
    dir: path.join(__dirname, 'migrations'),
    log: logger,
  });

  if (command === 'up') console.log(`applied: ${(await runner.up()).join(', ') || 'nothing'}`);
  if (command === 'down') console.log(`reverted: ${(await runner.down()) || 'nothing'}`);
  if (command === 'status') {
    for (const { name, appliedAt } of await runner.status()) {
      console.log(`${appliedAt.toISOString()}  ${name}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());

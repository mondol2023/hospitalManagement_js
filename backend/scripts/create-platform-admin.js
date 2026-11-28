'use strict';
/* eslint-disable no-console -- CLI entry point: stdout is its interface */

// Usage: PLATFORM_ADMIN_PASSWORD=... node scripts/create-platform-admin.js <email> <name>
// The first platform admin is never created over the API.

const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { User } = require('../src/models');
const context = require('../src/utils/context');
const { ROLES } = require('../src/utils/constants');

async function main() {
  const [email, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(' ').trim();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!email || !name || !password) {
    console.error('Usage: PLATFORM_ADMIN_PASSWORD=... node scripts/create-platform-admin.js <email> <name>');
    process.exitCode = 1;
    return;
  }

  await connectDatabase();
  const user = await context.withoutTenant('script:create-platform-admin', () =>
    User.create({ name, email, password, role: ROLES.PLATFORM_ADMIN })
  );
  console.log(`platform admin created: ${user.email}`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());

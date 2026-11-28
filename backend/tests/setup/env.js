'use strict';

/**
 * Runs before the test framework and before *any* source module is required.
 *
 * This has to be a `setupFiles` entry rather than `setupFilesAfterEnv`, because
 * `src/config/env.js` validates and freezes the configuration at require time.
 * A variable set after the first `require('../config/env')` is a variable the
 * application will never see.
 *
 * Two rules govern what is set here:
 *
 *  1. **The developer's real `.env` must not leak in.** `env.js` calls
 *     `dotenv.config()`, and dotenv never overwrites an existing key — so
 *     everything assigned below wins. Redis in particular is forced off: a
 *     suite that quietly connects to the developer's local Redis passes on
 *     their machine and hangs in CI.
 *  2. **`MONGODB_URI` is only defaulted, never forced.** The integration
 *     project's `globalSetup` puts the in-memory server's URI there before the
 *     workers fork, and overwriting it would point every test at a database
 *     that does not exist.
 */

process.env.NODE_ENV = 'test';
process.env.PORT = '0';

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hospital-test';
process.env.MONGO_MAX_POOL_SIZE = '5';
process.env.MONGO_MIN_POOL_SIZE = '1';

process.env.REDIS_ENABLED = 'false';
delete process.env.REDIS_URL;

// Distinct, deterministic, and long enough for the schema's 32-char minimum.
// Fixed rather than random so a failing token test can be reproduced by hand.
process.env.ROOT_DOMAIN = 'hms.test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789abcdefghijklmno';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789abcdefghijklmno';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '7d';

// The default of 12 costs ~250ms per hash. Every fixture user pays it, so the
// suite would spend most of its wall clock in bcrypt for no extra confidence.
process.env.BCRYPT_ROUNDS = '4';

process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.TRUST_PROXY = 'false';
process.env.CLUSTER_ENABLED = 'false';
process.env.LOG_LEVEL = 'error';

// Outbound providers stay unset so they no-op; a test that sends real mail is a
// test that pages a real person.
delete process.env.EMAIL_HOST;
delete process.env.SMS_PROVIDER_URL;
delete process.env.STRIPE_SECRET_KEY;
delete process.env.CLOUDINARY_NAME;

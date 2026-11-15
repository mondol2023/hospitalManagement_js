'use strict';

const {
  assertTransactionSupport,
  resetTransactionSupport,
} = require('../../src/utils/transaction');
const env = require('../../src/config/env');

const standalone = { db: { admin: () => ({ command: async () => ({ ok: 1 }) }) } };
const replicaSet = { db: { admin: () => ({ command: async () => ({ setName: 'rs0' }) }) } };

afterEach(() => resetTransactionSupport());

describe('assertTransactionSupport', () => {
  it('throws on a standalone MongoDB when transactions are required', async () => {
    await expect(
      assertTransactionSupport({ connection: standalone, required: true })
    ).rejects.toThrow(/MONGO_REQUIRE_TRANSACTIONS/);
  });

  it('passes on a replica set', async () => {
    await expect(
      assertTransactionSupport({ connection: replicaSet, required: true })
    ).resolves.toBe(true);
  });

  it('only warns on a standalone MongoDB when not required', async () => {
    await expect(
      assertTransactionSupport({ connection: standalone, required: false })
    ).resolves.toBe(false);
  });
});

describe('env.requireTransactions', () => {
  const load = (vars) => env.loadEnv({ ...process.env, ...vars });

  it('is on by default in production and off elsewhere', () => {
    const prod = {
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'a'.repeat(40),
      JWT_REFRESH_SECRET: 'b'.repeat(40),
      REDIS_ENABLED: 'false',
      CORS_ORIGINS: 'https://app.example.com',
    };
    expect(load(prod).requireTransactions).toBe(true);
    expect(load({ ...prod, MONGO_REQUIRE_TRANSACTIONS: 'false' }).requireTransactions).toBe(false);
    expect(load({ NODE_ENV: 'development' }).requireTransactions).toBe(false);
  });
});

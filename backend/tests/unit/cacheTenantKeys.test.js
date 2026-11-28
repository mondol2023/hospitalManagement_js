'use strict';

const RedisMock = require('ioredis-mock');
const {
  CacheService,
  buildKey,
  buildPlatformKey,
} = require('../../src/services/cacheService');
const context = require('../../src/utils/context');
const { TenantContextMissingError } = require('../../src/utils/tenantErrors');

const asOrg = (organizationId, fn) => context.run({ organizationId }, fn);

describe('tenant cache keys', () => {
  it('carry t:<org>: and differ between organisations for the same prefix and params', () => {
    const a = asOrg('orgA', () => buildKey('beds', { ward: 'ICU' }));
    const b = asOrg('orgB', () => buildKey('beds', { ward: 'ICU' }));
    expect(a).toBe('hms:v1:t:orgA:beds:ward=ICU');
    expect(b).toBe('hms:v1:t:orgB:beds:ward=ICU');
  });

  it('buildKey throws without a tenant', () => {
    expect(() => buildKey('beds')).toThrow(TenantContextMissingError);
    expect(() => context.run({}, () => buildKey('beds'))).toThrow(TenantContextMissingError);
  });

  it('namespace().key inherits the tenant prefix', () => {
    const cache = new CacheService(null);
    expect(asOrg('orgA', () => cache.namespace('beds').key('list'))).toBe(
      'hms:v1:t:orgA:beds:list'
    );
  });

  it('invalidate in org A does not delete org B keys', async () => {
    const client = new RedisMock();
    Object.defineProperty(client, 'status', { value: 'ready' });
    const cache = new CacheService(client);
    await asOrg('orgA', () => cache.set(buildKey('beds', { p: 1 }), 1));
    await asOrg('orgB', () => cache.set(buildKey('beds', { p: 1 }), 1));

    const removed = await asOrg('orgA', () => cache.invalidate('beds'));

    expect(removed).toBe(1);
    expect(await client.keys('*')).toEqual(['hms:v1:t:orgB:beds:p=1']);
  });

  it('invalidate throws without a tenant', async () => {
    await expect(new CacheService(null).invalidate('beds')).rejects.toThrow(
      TenantContextMissingError
    );
  });

  it('buildPlatformKey keeps the original hms:v1:<prefix> format', () => {
    expect(buildPlatformKey('jti:revoked:x')).toBe('hms:v1:jti:revoked:x');
    expect(buildPlatformKey('doctors', { b: 2, a: 1 })).toBe('hms:v1:doctors:a=1&b=2');
  });
});

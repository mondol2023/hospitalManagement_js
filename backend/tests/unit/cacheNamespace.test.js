'use strict';

const { CacheService, NAMESPACE } = require('../../src/services/cacheService');

describe('cache.namespace', () => {
  const cache = new CacheService(null);

  it('builds keys under the namespace prefix', () => {
    const beds = cache.namespace('beds');
    expect(beds.key('available', { ward: 'ICU' })).toBe(`${NAMESPACE}:beds:available:ward=ICU`);
    expect(beds.key('wards')).toBe(`${NAMESPACE}:beds:wards`);
  });

  it('invalidates by its own prefix', async () => {
    const spy = jest.spyOn(cache, 'invalidate').mockResolvedValue(3);
    await expect(cache.namespace('beds').invalidate()).resolves.toBe(3);
    expect(spy).toHaveBeenCalledWith('beds');
  });
});

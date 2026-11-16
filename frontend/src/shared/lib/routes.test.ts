import { describe, expect, it } from 'vitest';

import { APP_ROOT, PUBLIC_ROUTES, appPath } from './routes';

describe('appPath', () => {
  it('returns the app root for no sub-path', () => {
    expect(appPath()).toBe(APP_ROOT);
    expect(appPath('')).toBe(APP_ROOT);
  });

  it('prefixes a sub-path and tolerates leading slashes', () => {
    expect(appPath('billing')).toBe('/app/billing');
    expect(appPath('/billing')).toBe('/app/billing');
    expect(appPath('patients/123')).toBe('/app/patients/123');
  });

  it('keeps public routes outside the app area', () => {
    for (const path of Object.values<string>(PUBLIC_ROUTES)) {
      expect(path === APP_ROOT || path.startsWith(`${APP_ROOT}/`)).toBe(false);
    }
  });
});

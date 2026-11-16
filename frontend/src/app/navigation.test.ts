import { describe, expect, it } from 'vitest';

import { ROLES } from '@/shared/lib/roles';
import { APP_ROOT } from '@/shared/lib/routes';

import { accountItemsFor, NAV_ITEMS, navItemsFor } from './navigation';

describe('navigation', () => {
  it('keeps every entry inside the /app area with a unique path', () => {
    const paths = NAV_ITEMS.map((item) => item.to);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) {
      expect(path === APP_ROOT || path.startsWith(`${APP_ROOT}/`)).toBe(true);
    }
  });

  it('never shows a planned entry, whatever the role', () => {
    for (const role of Object.values(ROLES)) {
      expect(navItemsFor(role).some((item) => item.planned)).toBe(false);
    }
  });

  it('shows nothing without a role', () => {
    expect(navItemsFor(null)).toEqual([]);
  });

  it('gives a patient billing but not the patient directory', () => {
    const paths = navItemsFor(ROLES.PATIENT).map((item) => item.to);
    expect(paths).toContain('/app/billing');
    expect(paths).not.toContain('/app/patients');
  });

  describe('self-service pages (phase 3)', () => {
    const SELF_SERVICE = ['/app/notifications', '/app/profile', '/app/security'];

    it('are built and open to every role', () => {
      for (const path of SELF_SERVICE) {
        const item = NAV_ITEMS.find((entry) => entry.to === path);
        expect(item, path).toBeDefined();
        expect(item?.planned, path).toBeFalsy();
        for (const role of Object.values(ROLES)) {
          expect(item?.allow, `${path} for ${role}`).toContain(role);
        }
      }
    });

    it('stay out of the sidebar', () => {
      for (const role of Object.values(ROLES)) {
        const paths = navItemsFor(role).map((item) => item.to);
        for (const path of SELF_SERVICE) expect(paths).not.toContain(path);
      }
    });

    it('put profile and security in the account menu, in that order', () => {
      for (const role of Object.values(ROLES)) {
        expect(accountItemsFor(role).map((item) => item.to)).toEqual([
          '/app/profile',
          '/app/security',
        ]);
      }
      expect(accountItemsFor(null)).toEqual([]);
    });
  });

  describe('nurse pages (phase 4a)', () => {
    const NURSE_PAGES = [
      ['/app/ward', 'My ward'],
      ['/app/handover', 'Handover'],
      ['/app/workload', 'Workload'],
    ] as const;

    it('are built, and open to nurses only', () => {
      for (const [path] of NURSE_PAGES) {
        const item = NAV_ITEMS.find((entry) => entry.to === path);
        expect(item, path).toBeDefined();
        expect(item?.planned, path).toBeFalsy();
        expect(item?.allow, path).toEqual([ROLES.NURSE]);
      }
    });

    it('appear in a nurse’s sidebar, in order', () => {
      const paths = navItemsFor(ROLES.NURSE).map((item) => item.to);
      expect(paths.filter((path) => NURSE_PAGES.some(([p]) => p === path))).toEqual(
        NURSE_PAGES.map(([path]) => path)
      );
    });

    it('stay out of every other role’s sidebar', () => {
      for (const role of Object.values(ROLES).filter((r) => r !== ROLES.NURSE)) {
        const paths = navItemsFor(role).map((item) => item.to);
        for (const [path] of NURSE_PAGES) expect(paths, `${path} for ${role}`).not.toContain(path);
      }
    });
  });
});

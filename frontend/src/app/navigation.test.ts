import { describe, expect, it } from 'vitest';

import { ROLES, type Role } from '@/shared/lib/roles';
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

  describe('doctor pages (phase 4b)', () => {
    const DOCTOR_ONLY = ['/app/schedule', '/app/records'];
    const FOLLOW_UPS = '/app/follow-ups';

    it('are built', () => {
      for (const path of [...DOCTOR_ONLY, FOLLOW_UPS]) {
        const item = NAV_ITEMS.find((entry) => entry.to === path);
        expect(item, path).toBeDefined();
        expect(item?.planned, path).toBeFalsy();
      }
    });

    it('open My day and Records to doctors only', () => {
      for (const path of DOCTOR_ONLY) {
        expect(NAV_ITEMS.find((entry) => entry.to === path)?.allow, path).toEqual([ROLES.DOCTOR]);
      }
    });

    it('open Follow-ups to doctors and admin roles, not nurses', () => {
      expect(NAV_ITEMS.find((entry) => entry.to === FOLLOW_UPS)?.allow).toEqual([
        ROLES.DOCTOR,
        ROLES.ADMIN,
        ROLES.MANAGER,
      ]);
    });

    it('appear in a doctor’s sidebar, in order', () => {
      const paths = navItemsFor(ROLES.DOCTOR).map((item) => item.to);
      const mine = [...DOCTOR_ONLY, FOLLOW_UPS];
      expect(paths.filter((path) => mine.includes(path))).toEqual(mine);
    });

    it('show admin roles Follow-ups only', () => {
      for (const role of [ROLES.ADMIN, ROLES.MANAGER]) {
        const paths = navItemsFor(role).map((item) => item.to);
        expect(paths).toContain(FOLLOW_UPS);
        for (const path of DOCTOR_ONLY) expect(paths, `${path} for ${role}`).not.toContain(path);
      }
    });

    it('stay out of every other role’s sidebar', () => {
      const allowed: readonly string[] = [ROLES.DOCTOR, ROLES.ADMIN, ROLES.MANAGER];
      const others = Object.values(ROLES).filter((r) => !allowed.includes(r));
      for (const role of others) {
        const paths = navItemsFor(role).map((item) => item.to);
        for (const path of [...DOCTOR_ONLY, FOLLOW_UPS]) {
          expect(paths, `${path} for ${role}`).not.toContain(path);
        }
      }
    });
  });

  describe.each(['/app/my-health', '/app/my-care-team'])('patient page %s (phase 4c)', (path) => {
    it('is built, and open to patients only', () => {
      const item = NAV_ITEMS.find((entry) => entry.to === path);
      expect(item).toBeDefined();
      expect(item?.planned).toBeFalsy();
      expect(item?.allow).toEqual([ROLES.PATIENT]);
    });

    it('is in a patient’s sidebar and no one else’s', () => {
      expect(navItemsFor(ROLES.PATIENT).map((item) => item.to)).toContain(path);
      for (const role of Object.values(ROLES).filter((r) => r !== ROLES.PATIENT)) {
        expect(
          navItemsFor(role).map((item) => item.to),
          role
        ).not.toContain(path);
      }
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

  describe('front desk (phase 4d)', () => {
    const FRONT_DESK = '/app/front-desk';
    const ALLOWED: readonly Role[] = [ROLES.RECEPTIONIST, ROLES.ADMIN, ROLES.MANAGER];

    it('is built, and open to reception and the admin roles only', () => {
      const item = NAV_ITEMS.find((entry) => entry.to === FRONT_DESK);
      expect(item).toBeDefined();
      expect(item?.planned).toBeFalsy();
      expect([...(item?.allow ?? [])].sort()).toEqual([...ALLOWED].sort());
    });

    it('is in the sidebar of exactly those roles', () => {
      for (const role of Object.values(ROLES)) {
        const paths = navItemsFor(role).map((item) => item.to);
        if (ALLOWED.includes(role)) expect(paths, role).toContain(FRONT_DESK);
        else expect(paths, role).not.toContain(FRONT_DESK);
      }
    });
  });

  describe('revenue (phase 4d)', () => {
    const REVENUE = '/app/billing/revenue';
    const ALLOWED: readonly Role[] = [ROLES.ACCOUNTANT, ROLES.ADMIN, ROLES.MANAGER];

    it('is built, and open to the finance roles only', () => {
      const item = NAV_ITEMS.find((entry) => entry.to === REVENUE);
      expect(item).toBeDefined();
      expect(item?.planned).toBeFalsy();
      expect([...(item?.allow ?? [])].sort()).toEqual([...ALLOWED].sort());
    });

    it('is in the sidebar of exactly those roles', () => {
      for (const role of Object.values(ROLES)) {
        const paths = navItemsFor(role).map((item) => item.to);
        if (ALLOWED.includes(role)) expect(paths, role).toContain(REVENUE);
        else expect(paths, role).not.toContain(REVENUE);
      }
    });
  });

  describe('expiry (phase 4d)', () => {
    const EXPIRY = '/app/pharmacy/expiry';
    const ALLOWED: readonly Role[] = [ROLES.PHARMACIST, ROLES.ADMIN, ROLES.MANAGER];

    it('is built, and open to the inventory roles only', () => {
      const item = NAV_ITEMS.find((entry) => entry.to === EXPIRY);
      expect(item).toBeDefined();
      expect(item?.planned).toBeFalsy();
      expect([...(item?.allow ?? [])].sort()).toEqual([...ALLOWED].sort());
    });

    it('is in the sidebar of exactly those roles', () => {
      for (const role of Object.values(ROLES)) {
        const paths = navItemsFor(role).map((item) => item.to);
        if (ALLOWED.includes(role)) expect(paths, role).toContain(EXPIRY);
        else expect(paths, role).not.toContain(EXPIRY);
      }
    });
  });
});

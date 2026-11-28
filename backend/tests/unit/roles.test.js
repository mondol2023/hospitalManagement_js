'use strict';

const {
  ROLES,
  ROLE_VALUES,
  STAFF_ROLES,
  ADMIN_ROLES,
  TENANT_ADMIN_ASSIGNABLE_ROLES,
} = require('../../src/utils/constants');
const userValidators = require('../../src/validators/user');

describe('platform_admin role', () => {
  it('STAFF_ROLES and ADMIN_ROLES do not contain platform_admin; ROLE_VALUES does', () => {
    expect(ROLES.PLATFORM_ADMIN).toBe('platform_admin');
    expect(ROLE_VALUES).toContain('platform_admin');
    expect(STAFF_ROLES).not.toContain('platform_admin');
    expect(STAFF_ROLES).not.toContain('patient');
    expect(ADMIN_ROLES).not.toContain('platform_admin');
  });

  it('TENANT_ADMIN_ASSIGNABLE_ROLES is every role except platform_admin', () => {
    expect(TENANT_ADMIN_ASSIGNABLE_ROLES).not.toContain('platform_admin');
    expect([...TENANT_ADMIN_ASSIGNABLE_ROLES].sort()).toEqual(
      ROLE_VALUES.filter((r) => r !== 'platform_admin').sort()
    );
  });

  it('the user create/update validators reject role platform_admin', () => {
    const create = userValidators.create.body.safeParse({
      name: 'Root',
      email: 'root@example.com',
      password: 'Sup3rSecret!pass',
      role: 'platform_admin',
      profile: {},
    });
    expect(create.success).toBe(false);
    const changeRole = userValidators.changeRole.body.safeParse({ role: 'platform_admin', profile: {} });
    expect(changeRole.success).toBe(false);
    const list = userValidators.list.query.safeParse({ role: 'platform_admin' });
    expect(list.success).toBe(false);
  });
});

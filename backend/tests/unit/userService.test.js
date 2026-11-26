'use strict';

jest.mock('../../src/utils/transaction', () => ({
  withTransaction: jest.fn(async (fn) => fn(null)),
}));

const { UserService } = require('../../src/services/userService');
const ApiError = require('../../src/utils/ApiError');
const { ROLES } = require('../../src/utils/constants');

/**
 * The last-administrator guard, tested below the HTTP edge.
 *
 * Over the API the guard cannot fire: only an administrator may touch another
 * administrator, and nobody may touch themselves, so the caller is always an
 * administrator who survives the change. The check exists for callers that skip
 * the controller — scripts, seeders, a future role — so it is exercised here by
 * handing the service an actor the router would never have admitted.
 */

const ADMIN_TARGET = { _id: 'target-1', role: ROLES.ADMIN, isActive: true };

const build = ({ activeAdmins }) => {
  const users = {
    findByIdOrThrow: jest.fn(async () => ({ ...ADMIN_TARGET })),
    countActive: jest.fn(async () => activeAdmins),
    updateById: jest.fn(async (id, update) => ({ ...ADMIN_TARGET, ...update.$set })),
    revokeTokens: jest.fn(async () => undefined),
  };
  const profiles = {
    modelFor: jest.fn((role) => (role === ROLES.ADMIN || role === ROLES.MANAGER ? 'Staff' : role)),
    repositoryFor: jest.fn(() => ({ updateOne: jest.fn(async () => ({})) })),
    createProfile: jest.fn(),
    findByUser: jest.fn(),
    deleteForUser: jest.fn(),
  };
  const cache = { namespace: () => ({ invalidate: jest.fn(), key: jest.fn() }), wrap: jest.fn() };
  return { service: new UserService({ users, profiles, cache }), users, profiles };
};

// Not the target, and not an admin — the one actor the router would refuse.
const OUTSIDE_ACTOR = { id: 'someone-else', role: ROLES.ADMIN };

describe('UserService — the last active administrator', () => {
  it('refuses to demote the only active administrator', async () => {
    const { service, users } = build({ activeAdmins: 1 });

    const attempt = service.changeRole('target-1', ROLES.MANAGER, {}, OUTSIDE_ACTOR);

    await expect(attempt).rejects.toMatchObject({
      statusCode: 409,
      code: 'LAST_ADMIN',
    });
    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    expect(users.updateById).not.toHaveBeenCalled();
    expect(users.revokeTokens).not.toHaveBeenCalled();
  });

  it('refuses to deactivate the only active administrator', async () => {
    const { service, users } = build({ activeAdmins: 1 });

    await expect(service.setActive('target-1', false, OUTSIDE_ACTOR)).rejects.toMatchObject({
      statusCode: 409,
      code: 'LAST_ADMIN',
    });
    expect(users.updateById).not.toHaveBeenCalled();
  });

  it('allows the same change while another administrator remains', async () => {
    const { service, users } = build({ activeAdmins: 2 });

    await service.setActive('target-1', false, OUTSIDE_ACTOR);

    expect(users.updateById).toHaveBeenCalled();
  });

  it('counts administrators only, not every active account', async () => {
    const { service, users } = build({ activeAdmins: 2 });

    await service.setActive('target-1', false, OUTSIDE_ACTOR);

    expect(users.countActive.mock.calls[0][0]).toEqual({ role: ROLES.ADMIN });
  });
});

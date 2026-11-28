'use strict';

const { z } = require('zod');
const context = require('../../src/utils/context');
const { on } = require('../../src/sockets/eventHandler');
const { ROLES } = require('../../src/utils/constants');

function fakeSocket(user) {
  const listeners = {};
  return {
    id: 's1',
    data: { user },
    on: (event, fn) => {
      listeners[event] = fn;
    },
    emit: jest.fn(),
    fire: (event, payload) => listeners[event](payload, jest.fn()),
  };
}

describe('socket event handler context', () => {
  it('runs the handler with the actor\'s organization in context', async () => {
    const socket = fakeSocket({
      id: 'u1',
      role: ROLES.DOCTOR,
      organizationId: 'orgA',
      branchId: 'brA',
      branchIds: ['brA'],
    });
    let seen;
    on(socket, 'x', z.object({}), async () => {
      seen = { ...context.get() };
    });

    await socket.fire('x', {});

    expect(seen).toMatchObject({
      source: 'socket',
      userId: 'u1',
      organizationId: 'orgA',
      branchId: 'brA',
      branchIds: ['brA'],
      canReadAllBranches: false,
      defaultBranchRead: 'active',
    });
  });

  it('gives a patient cross-branch reads', async () => {
    const socket = fakeSocket({ id: 'p1', role: ROLES.PATIENT, organizationId: 'orgA', branchId: 'brA' });
    let seen;
    on(socket, 'x', z.object({}), async () => {
      seen = { ...context.get() };
    });

    await socket.fire('x', {});

    expect(seen).toMatchObject({ canReadAllBranches: true, defaultBranchRead: 'all' });
  });
});

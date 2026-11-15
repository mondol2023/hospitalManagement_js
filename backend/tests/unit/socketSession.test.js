'use strict';

const { watchSession } = require('../../src/sockets');
const ApiError = require('../../src/utils/ApiError');
const { ROLES } = require('../../src/utils/constants');

const INTERVAL = 60_000;

function fakeSocket(role = ROLES.DOCTOR) {
  const handlers = {};
  return {
    data: { user: { id: 'u1', role }, token: 'tok' },
    emit: jest.fn(),
    disconnect: jest.fn(),
    once: (event, fn) => {
      handlers[event] = fn;
    },
    fire: (event) => handlers[event]?.(),
  };
}

const tick = async () => {
  await jest.advanceTimersByTimeAsync(INTERVAL);
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('watchSession', () => {
  it('keeps a socket whose actor is unchanged', async () => {
    const socket = fakeSocket();
    const resolve = jest.fn().mockResolvedValue({ id: 'u1', role: ROLES.DOCTOR });
    watchSession(socket, { resolve, intervalMs: INTERVAL });

    await tick();

    expect(resolve).toHaveBeenCalledWith('tok');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects when the token is no longer valid', async () => {
    const socket = fakeSocket();
    const resolve = jest.fn().mockRejectedValue(ApiError.unauthorized('gone', { code: 'ACCOUNT_INACTIVE' }));
    watchSession(socket, { resolve, intervalMs: INTERVAL });

    await tick();

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects when the role changed so rooms are rebuilt on reconnect', async () => {
    const socket = fakeSocket(ROLES.DOCTOR);
    const resolve = jest.fn().mockResolvedValue({ id: 'u1', role: ROLES.PATIENT });
    watchSession(socket, { resolve, intervalMs: INTERVAL });

    await tick();

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('does not disconnect on a transient infrastructure error', async () => {
    const socket = fakeSocket();
    const resolve = jest.fn().mockRejectedValue(new Error('mongo down'));
    watchSession(socket, { resolve, intervalMs: INTERVAL });

    await tick();

    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('stops checking once the socket disconnects', async () => {
    const socket = fakeSocket();
    const resolve = jest.fn().mockResolvedValue({ id: 'u1', role: ROLES.DOCTOR });
    watchSession(socket, { resolve, intervalMs: INTERVAL });

    socket.fire('disconnect');
    await tick();

    expect(resolve).not.toHaveBeenCalled();
  });
});

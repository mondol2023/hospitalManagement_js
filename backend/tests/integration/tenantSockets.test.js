'use strict';

const http = require('node:http');
const { io: connect } = require('socket.io-client');
const { createSocketServer, closeSocketServer } = require('../../src/sockets');
const realtimeService = require('../../src/services/realtimeService');
const context = require('../../src/utils/context');
const { createActor, createAdmittedPatient } = require('../helpers/factories');
const { makeTenant } = require('../helpers/tenant');
const { ROLES, SOCKET_EVENTS } = require('../../src/utils/constants');

/** Two real sockets on two tenants: the room names must keep them apart. */

let server;
let io;
let port;
const clients = [];

beforeAll(async () => {
  server = http.createServer();
  io = createSocketServer(server);
  await new Promise((resolve) => server.listen(0, resolve));
  ({ port } = server.address());
});

afterEach(() => {
  clients.splice(0).forEach((c) => c.close());
});

afterAll(async () => {
  await closeSocketServer(io);
  await new Promise((resolve) => server.close(resolve));
});

function open(token) {
  const client = connect(`http://localhost:${port}`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });
  clients.push(client);
  return new Promise((resolve, reject) => {
    client.once('connect', () => resolve(client));
    client.once('connect_error', reject);
  });
}

const request = (client, event, payload) =>
  new Promise((resolve) => client.emit(event, payload, resolve));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('tenant-aware sockets', () => {
  it('does not deliver a staff emit in organisation A to a socket of organisation B', async () => {
    const tenantB = await makeTenant();
    const nurseA = await createActor(ROLES.NURSE);
    const nurseB = await createActor(ROLES.NURSE, { tenant: tenantB });
    const [clientA, clientB] = [await open(nurseA.token), await open(nurseB.token)];

    const gotA = jest.fn();
    const gotB = jest.fn();
    clientA.on(SOCKET_EVENTS.EMERGENCY_ALERT, gotA);
    clientB.on(SOCKET_EVENTS.EMERGENCY_ALERT, gotB);

    // The default test tenant is "A"; the emit reads its organisation from context.
    realtimeService.toStaff(SOCKET_EVENTS.EMERGENCY_ALERT, { n: 1 });
    realtimeService.toRole(ROLES.NURSE, SOCKET_EVENTS.EMERGENCY_ALERT, { n: 2 });
    await wait(200);

    expect(gotA).toHaveBeenCalledTimes(2);
    expect(gotB).not.toHaveBeenCalled();

    // And the reverse direction, emitted from B's own scope.
    context.run(tenantB.store, () => realtimeService.toStaff(SOCKET_EVENTS.EMERGENCY_ALERT, { n: 3 }));
    await wait(200);
    expect(gotB).toHaveBeenCalledTimes(1);
    expect(gotA).toHaveBeenCalledTimes(2);
  });

  it('refuses to emit to an organisation room without a tenant', () => {
    expect(() =>
      context.run({ source: 'job' }, () => realtimeService.toStaff(SOCKET_EVENTS.EMERGENCY_ALERT, {}))
    ).toThrow(/tenant/i);
  });

  it('care:subscribe for another organisation\'s patient fails with 404', async () => {
    const tenantB = await makeTenant();
    const patientA = await createAdmittedPatient({});
    const doctorB = await createActor(ROLES.DOCTOR, { tenant: tenantB });
    const client = await open(doctorB.token);

    const ack = await request(client, 'care:subscribe', { patientId: String(patientA.profile._id) });

    expect(ack.success).toBe(false);
    expect(ack.error.status).toBe(404);
  });
});

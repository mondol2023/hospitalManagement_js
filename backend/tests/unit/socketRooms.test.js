'use strict';

const { SOCKET_ROOMS, ROLES } = require('../../src/utils/constants');
const { roomsFor } = require('../../src/sockets');

const ORG = '64b0000000000000000000aa';

describe('socket rooms', () => {
  it('builds org-prefixed staff and role rooms', () => {
    expect(SOCKET_ROOMS.staff(ORG)).toBe(`org:${ORG}:staff`);
    expect(SOCKET_ROOMS.role(ORG, ROLES.NURSE)).toBe(`org:${ORG}:role:nurse`);
  });

  it('no role-derived room name exists without an organisation id', () => {
    for (const missing of [undefined, null, '']) {
      expect(() => SOCKET_ROOMS.staff(missing)).toThrow();
      expect(() => SOCKET_ROOMS.role(missing, ROLES.NURSE)).toThrow();
    }
  });

  it('leaves id-keyed rooms unchanged', () => {
    expect(SOCKET_ROOMS.user('u1')).toBe('user:u1');
    expect(SOCKET_ROOMS.conversation('c1')).toBe('conversation:c1');
    expect(SOCKET_ROOMS.patientCare('p1')).toBe('care:p1');
  });

  it('roomsFor passes the actor organisation to every role-derived room', () => {
    const rooms = roomsFor({ id: 'u1', role: ROLES.NURSE, organizationId: ORG });
    expect(rooms).toEqual(expect.arrayContaining(['user:u1', `org:${ORG}:role:nurse`, `org:${ORG}:staff`]));
    expect(rooms.filter((r) => r.startsWith('role:'))).toEqual([]);
  });

  it('roomsFor gives an actor with no organisation only their own room', () => {
    expect(roomsFor({ id: 'p1', role: ROLES.PLATFORM_ADMIN, organizationId: null })).toEqual(['user:p1']);
  });
});

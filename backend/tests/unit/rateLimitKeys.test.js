'use strict';

const { clientKey, refreshKey, authKey } = require('../../src/middleware/rateLimit');
const { TokenService } = require('../../src/services/tokenService');
const env = require('../../src/config/env');
const { ROLES } = require('../../src/utils/constants');

const tokens = new TokenService({ cache: {}, config: env });
const user = { _id: 'user-1', role: ROLES.DOCTOR };
const access = () => tokens.signAccessToken({ sub: user._id, role: user.role });
const refresh = () => tokens.signRefreshToken({ sub: user._id, role: user.role });
const req = (extra = {}) => ({ ip: '10.0.0.1', headers: {}, body: {}, ...extra });

describe('clientKey', () => {
  it('keys by the sub of a verified bearer token', () => {
    const r = req({ headers: { authorization: `Bearer ${access()}` } });
    expect(clientKey(r, tokens)).toBe('u:user-1');
  });

  it('gives two users behind one IP separate buckets', () => {
    const other = tokens.signAccessToken({ sub: 'user-2', role: ROLES.NURSE });
    const a = clientKey(req({ headers: { authorization: `Bearer ${access()}` } }), tokens);
    const b = clientKey(req({ headers: { authorization: `Bearer ${other}` } }), tokens);
    expect(a).not.toBe(b);
  });

  it('falls back to IP for a forged or garbage token', () => {
    const r = req({ headers: { authorization: 'Bearer not.a.jwt' } });
    expect(clientKey(r, tokens)).toBe('ip:10.0.0.1');
  });

  it('does not accept a refresh token as a bearer identity', () => {
    const r = req({ headers: { authorization: `Bearer ${refresh()}` } });
    expect(clientKey(r, tokens)).toBe('ip:10.0.0.1');
  });

  it('prefers req.user when authenticate already ran', () => {
    expect(clientKey(req({ user: { id: 'u9' } }), tokens)).toBe('u:u9');
  });
});

describe('refreshKey', () => {
  it('keys by the sub of a verified refresh token in the body', () => {
    expect(refreshKey(req({ body: { refreshToken: refresh() } }), tokens)).toBe('u:user-1');
  });

  it('falls back to IP when the body has no usable refresh token', () => {
    expect(refreshKey(req(), tokens)).toBe('ip:10.0.0.1');
    expect(refreshKey(req({ body: { refreshToken: 'junk' } }), tokens)).toBe('ip:10.0.0.1');
  });
});

describe('authKey', () => {
  const resolver = {
    knownOrganizationCode: jest.fn(async ({ organizationCode, host }) => {
      if (organizationCode) return organizationCode.toUpperCase() === 'LEBL' ? 'LEBL' : '';
      return host === 'lebl.hms.test' ? 'lebl' : '';
    }),
  };
  const body = (extra) => ({ email: ' A@B.co ', ...extra });

  it('adds a known organisation code', async () => {
    const key = await authKey(req({ body: body({ organizationCode: 'lebl' }) }), resolver);
    expect(key).toBe('ip:10.0.0.1|em:a@b.co|org:LEBL');
  });

  it('ignores junk codes so they cannot mint buckets', async () => {
    const a = await authKey(req({ body: body({ organizationCode: 'ZZZ1' }) }), resolver);
    const b = await authKey(req({ body: body({ organizationCode: 'ZZZ2' }) }), resolver);
    expect(a).toBe('ip:10.0.0.1|em:a@b.co');
    expect(b).toBe(a);
  });

  it('uses the host subdomain', async () => {
    const key = await authKey(req({ body: body(), hostname: 'lebl.hms.test' }), resolver);
    expect(key).toBe('ip:10.0.0.1|em:a@b.co|org:lebl');
  });
});

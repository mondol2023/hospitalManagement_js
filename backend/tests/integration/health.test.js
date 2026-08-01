'use strict';

const { api, url, expectError } = require('../helpers/api');

/**
 * The pipeline itself: probes, the error envelope, and the security headers.
 *
 * These assertions look trivial and are not. Every one of them protects a
 * behaviour that is invisible until it breaks in production — a readiness probe
 * that lies, a 404 that returns HTML to a JSON client, a stack trace in a
 * response body.
 */
describe('application pipeline', () => {
  describe('probes', () => {
    it('reports liveness without touching a dependency', async () => {
      const res = await api().get('/health');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.pid).toBe(process.pid);
    });

    it('reports readiness once the database is connected', async () => {
      const res = await api().get('/health/ready');

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: 'ready', database: true });
    });

    it('goes not-ready while draining, so the balancer stops sending work', async () => {
      const { app } = require('../helpers/api');
      app.set('shuttingDown', true);
      try {
        const res = await api().get('/health/ready');

        expect(res.status).toBe(503);
        expect(res.body.data.status).toBe('draining');
      } finally {
        app.set('shuttingDown', false);
      }
    });

    it('reports redis as disabled rather than failing the check', async () => {
      // The app is designed to serve without Redis; a cache outage must not
      // empty the load balancer pool.
      const res = await api().get('/health/ready');

      expect(res.body.data.redis).toBe('disabled');
      expect(res.status).toBe(200);
    });
  });

  describe('routing', () => {
    it('lists the mounted resources at the version root', async () => {
      const res = await api().get(url('/'));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.resources)).toBe(true);
      expect(res.body.data.resources.length).toBeGreaterThan(0);
    });

    it('answers an unknown route with the JSON error envelope', async () => {
      const res = await api().get(url('/definitely-not-a-route'));

      expectError(res, 404, 'ROUTE_NOT_FOUND');
      expect(res.headers['content-type']).toMatch(/json/);
    });

    it('rejects a protected route with no credentials', async () => {
      const res = await api().get(url('/notifications'));

      expectError(res, 401, 'TOKEN_MISSING');
    });

    it('rejects a malformed bearer token', async () => {
      const res = await api().get(url('/notifications')).set('Authorization', 'Bearer nonsense');

      expectError(res, 401, 'TOKEN_INVALID');
    });
  });

  describe('hardening', () => {
    it('sets security headers and hides the framework', async () => {
      const res = await api().get('/health');

      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('stamps a request id on every response', async () => {
      const res = await api().get('/health');

      expect(res.headers['x-request-id']).toEqual(expect.any(String));
    });

    it('echoes a client-supplied request id so a trace spans both sides', async () => {
      const res = await api().get('/health').set('X-Request-Id', 'trace-me-123');

      expect(res.headers['x-request-id']).toBe('trace-me-123');
    });

    it('rejects a body larger than the configured limit', async () => {
      const res = await api()
        .post(url('/auth/login'))
        .set('Content-Type', 'application/json')
        .send(`{"email":"a@b.co","password":"${'x'.repeat(1_200_000)}"}`);

      expect(res.status).toBe(413);
      expect(res.body.success).toBe(false);
    });

    it('answers malformed JSON with 400, not a stack trace', async () => {
      const res = await api()
        .post(url('/auth/login'))
        .set('Content-Type', 'application/json')
        .send('{"email": ');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).not.toMatch(/at Object|node_modules/);
    });
  });
});

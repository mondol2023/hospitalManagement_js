'use strict';

const express = require('express');
const compression = require('compression');
const morgan = require('morgan');

const env = require('./config/env');
const logger = require('./config/logger');
const { isDatabaseHealthy } = require('./config/database');
const { isRedisHealthy } = require('./config/redis');
const {
  requestContext,
  corsMiddleware,
  helmetMiddleware,
  sanitizeMiddleware,
  hppMiddleware,
  globalLimiter,
  errorHandler,
  notFoundHandler,
} = require('./middleware');
const routes = require('./routes');

/**
 * The HTTP pipeline.
 *
 * This module builds an app and returns it. It does not listen, does not connect
 * to anything, and does not read the clock — `server.js` owns the process and
 * this owns the request. That split is what lets the integration suite mount the
 * real application against an in-memory Mongo with `supertest` and no open port.
 *
 * Order below is load-bearing, top to bottom:
 *
 *  1. `trust proxy` first, because everything that reads `req.ip` — rate
 *     limiting, audit logging — is wrong before it is set.
 *  2. `requestContext`, so the id exists for every log line and every error
 *     envelope, including ones raised by the parsers underneath it.
 *  3. Security headers and CORS before anything reads a body: a rejected origin
 *     should cost us a header comparison, not a megabyte of parsing.
 *  4. Health checks before the rate limiter, so a monitoring agent polling every
 *     five seconds can never exhaust the budget and take the API "down" by
 *     declaring it down.
 *  5. Everything else, then the 404, then the single error handler last.
 */
function createApp() {
  const app = express();

  /**
   * Behind a load balancer `req.ip` is the balancer unless we opt in, which
   * would make per-IP limiting a single shared bucket for the whole hospital.
   * One hop only: trusting the whole chain lets a client forge `X-Forwarded-For`
   * and pick its own rate-limit key.
   */
  app.set('trust proxy', env.TRUST_PROXY ? 1 : false);
  app.disable('x-powered-by');
  app.set('etag', 'strong');

  app.use(requestContext);
  app.use(helmetMiddleware());
  app.use(corsMiddleware());
  app.use(compression());

  app.use(express.json({ limit: env.BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: env.BODY_LIMIT }));
  app.use(sanitizeMiddleware());
  app.use(hppMiddleware());

  if (!env.isTest) {
    app.use(
      morgan(':method :url :status :response-time ms - :res[content-length]', {
        stream: logger.stream,
        // The probe endpoints are polled continuously and say nothing useful.
        skip: (req) => req.path.startsWith('/health'),
      })
    );
  }

  app.use('/health', createHealthRouter());

  app.use(globalLimiter);
  app.use('/api/v1', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * Liveness and readiness, kept apart on purpose.
 *
 * `/health` answers "is this process alive" and must not touch a dependency: an
 * orchestrator that restarts workers because Mongo hiccuped turns a database
 * blip into a rolling outage. `/health/ready` answers "should traffic come here"
 * and is the one that checks dependencies, so a worker with no database is taken
 * out of rotation without being killed.
 *
 * Redis is reported but never fails the check — the app is designed to serve
 * without it, so a cache outage must not empty the load balancer pool.
 */
function createHealthRouter() {
  const router = express.Router();
  const startedAt = Date.now();

  router.get('/', (req, res) =>
    res.json({
      success: true,
      data: {
        status: 'ok',
        pid: process.pid,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      },
    })
  );

  router.get('/ready', (req, res) => {
    // Set by the shutdown sequence before the listener closes, so a load
    // balancer stops sending work while in-flight requests finish. Without it
    // the drain window is exactly as long as the balancer's polling interval,
    // and every request that arrives in it is a connection reset for a user.
    const draining = Boolean(req.app.get('shuttingDown'));
    const database = isDatabaseHealthy();
    const redis = env.redisEnabled ? isRedisHealthy() : 'disabled';
    const ready = database && !draining;

    return res.status(ready ? 200 : 503).json({
      success: ready,
      data: { status: draining ? 'draining' : ready ? 'ready' : 'not-ready', database, redis },
    });
  });

  return router;
}

module.exports = createApp;
module.exports.createApp = createApp;
module.exports.createHealthRouter = createHealthRouter;

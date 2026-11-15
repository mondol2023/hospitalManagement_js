'use strict';

const http = require('http');
const os = require('os');
const cluster = require('cluster');

const env = require('./config/env');
const logger = require('./config/logger');
const { connectDatabase, disconnectDatabase, ensureIndexes } = require('./config/database');
const { disconnectRedis } = require('./config/redis');
const { assertTransactionSupport } = require('./utils/transaction');
const createApp = require('./app');
const { createSocketServer, closeSocketServer } = require('./sockets');

/**
 * The process.
 *
 * `app.js` builds a request pipeline; this file decides how many processes run
 * it, when they are ready, and how they stop. Keeping the two apart is what lets
 * the integration suite import the app without a listener, a database connection
 * or a signal handler being installed behind its back.
 *
 * **Clustering.** Node runs JavaScript on one thread, so a single process uses
 * one core no matter how many cores the box has. At the 10k-user target that is
 * the difference between using a machine and using an eighth of it. Workers share
 * nothing, which is why every piece of cross-process state in this codebase —
 * rate-limit counters, the cache, the socket backplane — lives in Redis rather
 * than in a module-level `Map`.
 *
 * **Ordering at boot.** The database connects *before* the listener opens.
 * Accepting traffic first would mean the first requests after a deploy fail
 * against an unconnected pool, which reads as a deploy-time error spike nobody
 * can reproduce afterwards.
 *
 * **Ordering at shutdown** is the same list backwards, and it matters more:
 * readiness goes red, the listener stops accepting, in-flight work finishes, then
 * connections close. A `process.exit()` on SIGTERM — which is what the original
 * code did by having no handler at all — truncates whatever was mid-write.
 */

/** Resolves the worker count: `0` means "one per core". */
function workerCount() {
  const configured = env.CLUSTER_WORKERS;
  if (configured > 0) return configured;
  return Math.max(1, os.cpus().length);
}

/**
 * The primary process: it supervises, it does not serve.
 *
 * A worker that dies is replaced, because one crashed request handler must not
 * permanently reduce capacity. A worker that dies *immediately and repeatedly* is
 * not replaced forever — that is a broken deploy, and an infinite respawn loop
 * turns it into a busy loop that also hides the crash in a wall of restarts.
 */
function runPrimary() {
  const count = workerCount();
  logger.info(`Primary ${process.pid} starting ${count} workers`);

  const recentExits = [];
  const CRASH_WINDOW_MS = 10_000;
  const CRASH_LIMIT = 10;
  let stopping = false;

  for (let i = 0; i < count; i += 1) cluster.fork();

  cluster.on('exit', (worker, code, signal) => {
    if (stopping) return;

    logger.error('Worker exited', { pid: worker.process.pid, code, signal });

    const now = Date.now();
    recentExits.push(now);
    while (recentExits.length && now - recentExits[0] > CRASH_WINDOW_MS) recentExits.shift();

    if (recentExits.length > CRASH_LIMIT) {
      logger.error('Workers are crash-looping; the primary is giving up', {
        exits: recentExits.length,
        windowMs: CRASH_WINDOW_MS,
      });
      process.exit(1);
    }

    cluster.fork();
  });

  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    logger.info(`Primary received ${signal}, stopping workers`);

    Object.values(cluster.workers || {}).forEach((worker) => worker?.kill(signal));

    // Workers each run their own drain with the same budget; give them that plus
    // a margin before taking the whole tree down.
    setTimeout(() => process.exit(0), env.SHUTDOWN_TIMEOUT_MS + 2000).unref();
  };

  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

/**
 * Boots one HTTP + realtime worker and returns the pieces the shutdown path
 * needs. Exported so an integration test can start and stop a real listener
 * without shelling out to a second process.
 */
async function startWorker({ port = env.PORT } = {}) {
  await connectDatabase();
  await assertTransactionSupport();

  // Outside production, boot doubles as the migration step so a fresh clone has
  // its indexes. In production the same call belongs to a deploy task: N workers
  // each rebuilding every index turns a rolling restart into an outage.
  if (!env.isProduction) await ensureIndexes();

  const app = createApp();
  const server = http.createServer(app);
  const io = createSocketServer(server);

  /**
   * Both timeouts exist because of the same race behind a load balancer: if the
   * server closes an idle connection at the instant the balancer sends a request
   * on it, the client sees a 502 nobody can explain. Keep-alive must outlive the
   * balancer's own idle timeout (60s is the common default), and the headers
   * timeout must outlive keep-alive.
   */
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.requestTimeout = 30_000;

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  logger.info(`Worker ${process.pid} listening on port ${server.address().port}`, {
    env: env.NODE_ENV,
    redis: env.redisEnabled,
  });

  return { app, server, io };
}

/**
 * Drains and exits.
 *
 * Guarded against re-entry because an operator pressing Ctrl-C twice, or an
 * orchestrator sending SIGTERM then SIGKILL, would otherwise start two shutdowns
 * and have the second one close a connection the first is still using.
 */
function createShutdown({ app, server, io }) {
  let shuttingDown = false;

  return async function shutdown(reason, exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info(`Shutting down: ${reason}`);
    app.set('shuttingDown', true);

    // The hard deadline. If a request hangs on a slow query the process still
    // has to go, and an orchestrator's SIGKILL is a worse way to find that out.
    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      await closeSocketServer(io);
      await new Promise((resolve) => server.close(resolve));
      await disconnectDatabase();
      await disconnectRedis();
      logger.info('Shutdown complete');
      clearTimeout(forceExit);
      process.exit(exitCode);
    } catch (error) {
      logger.error('Shutdown failed', { error: error.message });
      process.exit(1);
    }
  };
}

/**
 * Installs the process-level handlers.
 *
 * An uncaught exception or an unhandled rejection means the process is in a state
 * nobody reasoned about, so it drains and exits rather than continuing to serve.
 * That is not pessimism — a handler that swallows them keeps a worker alive with
 * corrupted state, and under a cluster the alternative is a clean replacement
 * worker a few hundred milliseconds later.
 */
function installSignalHandlers(shutdown) {
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    shutdown('unhandledRejection', 1);
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    shutdown('uncaughtException', 1);
  });
}

async function main() {
  if (env.CLUSTER_ENABLED && cluster.isPrimary) {
    runPrimary();
    return;
  }

  try {
    const worker = await startWorker();
    installSignalHandlers(createShutdown(worker));
  } catch (error) {
    logger.error('Failed to start', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// `require.main === module` keeps the suite free to import `startWorker` without
// booting a server as a side effect of the import.
if (require.main === module) {
  main();
}

module.exports = {
  main,
  startWorker,
  createShutdown,
  installSignalHandlers,
  runPrimary,
  workerCount,
};

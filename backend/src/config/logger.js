'use strict';

const winston = require('winston');
const env = require('./env');
const context = require('../utils/context');

/**
 * Structured logging. JSON in production so log aggregators can index it;
 * human-readable in development. Errors keep their stack via `errors({ stack })`.
 */

/** Copies the active request/tenant ids from the context store onto each entry. */
const tenantContextFormat = winston.format((info) => {
  const store = context.get();
  if (store) {
    for (const key of ['requestId', 'organizationId', 'branchId']) {
      if (store[key] !== undefined && store[key] !== null) info[key] = String(store[key]);
    }
  }
  return info;
});

const productionFormat = winston.format.combine(
  tenantContextFormat(),
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const developmentFormat = winston.format.combine(
  tenantContextFormat(),
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${stack || message}${rest}`;
  })
);

const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  defaultMeta: { service: 'hospital-api', pid: process.pid },
  format: env.isProduction ? productionFormat : developmentFormat,
  transports: [
    new winston.transports.Console({
      // Never let a logging failure take down a request.
      handleExceptions: false,
      silent: env.isTest,
    }),
  ],
  exitOnError: false,
});

/**
 * Morgan writes newline-terminated strings; route them through winston so all
 * output shares one format and one destination.
 */
logger.stream = {
  write: (message) => logger.http(message.trim()),
};

module.exports = logger;
module.exports.tenantContextFormat = tenantContextFormat;

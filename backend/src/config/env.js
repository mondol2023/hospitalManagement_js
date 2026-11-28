'use strict';

/**
 * Environment loading and validation.
 *
 * The original code read `process.env` directly from a dozen modules, several of
 * them at require-time and *before* dotenv had run. That silently produced
 * `undefined` connection strings. Here the environment is loaded once, validated
 * against a schema, and exported as a frozen object. A misconfigured deployment
 * fails loudly at boot instead of at 3am under load.
 */

const path = require('path');
const { z } = require('zod');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const bool = (defaultValue) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? defaultValue : v === 'true' || v === '1'));

const int = (defaultValue, { min, max } = {}) => {
  let schema = z.coerce.number().int();
  if (min !== undefined) schema = schema.min(min);
  if (max !== undefined) schema = schema.max(max);
  return schema.default(defaultValue);
};

const csv = (defaultValue) =>
  z
    .string()
    .optional()
    .transform((v) =>
      (v === undefined || v.trim() === '' ? defaultValue : v)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: int(5000, { min: 0, max: 65535 }),

    // --- Persistence -------------------------------------------------------
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    MONGO_MAX_POOL_SIZE: int(50, { min: 1 }),
    MONGO_MIN_POOL_SIZE: int(5, { min: 0 }),
    MONGO_SERVER_SELECTION_TIMEOUT_MS: int(10000, { min: 1000 }),
    MONGO_SOCKET_TIMEOUT_MS: int(45000, { min: 1000 }),
    // Production refuses to boot on a standalone MongoDB unless this is false.
    MONGO_REQUIRE_TRANSACTIONS: bool(true),

    // --- Cache / pub-sub ---------------------------------------------------
    // Optional: the app degrades gracefully to in-process behaviour without it.
    REDIS_URL: z.string().optional(),
    REDIS_ENABLED: bool(true),
    CACHE_TTL_SECONDS: int(60, { min: 1 }),

    // --- Auth --------------------------------------------------------------
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be >= 32 chars'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be >= 32 chars'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('7d'),
    JWT_ISSUER: z.string().default('hospital-management-api'),
    BCRYPT_ROUNDS: int(12, { min: 4, max: 15 }),

    // --- HTTP --------------------------------------------------------------
    CORS_ORIGINS: csv('http://localhost:3000'),
    ROOT_DOMAIN: z.string().optional(),
    TRUST_PROXY: bool(false),
    BODY_LIMIT: z.string().default('1mb'),
    RATE_LIMIT_WINDOW_MS: int(15 * 60 * 1000, { min: 1000 }),
    RATE_LIMIT_MAX: int(300, { min: 1 }),
    AUTH_RATE_LIMIT_MAX: int(10, { min: 1 }),

    // --- Runtime -----------------------------------------------------------
    CLUSTER_ENABLED: bool(false),
    CLUSTER_WORKERS: int(0, { min: 0 }), // 0 => os.cpus().length
    SHUTDOWN_TIMEOUT_MS: int(15000, { min: 1000 }),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),

    // --- Outbound integrations (all optional; providers no-op when unset) ---
    EMAIL_HOST: z.string().optional(),
    EMAIL_PORT: int(587, { min: 1, max: 65535 }),
    EMAIL_USER: z.string().optional(),
    EMAIL_PASS: z.string().optional(),
    EMAIL_FROM: z.string().default('no-reply@hospital.local'),
    SMS_PROVIDER_URL: z.string().optional(),
    SMS_API_KEY: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    CLOUDINARY_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    UPLOAD_MAX_BYTES: int(5 * 1024 * 1024, { min: 1024 }),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.MONGO_MIN_POOL_SIZE > cfg.MONGO_MAX_POOL_SIZE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MONGO_MIN_POOL_SIZE'],
        message: 'MONGO_MIN_POOL_SIZE cannot exceed MONGO_MAX_POOL_SIZE',
      });
    }
    if (cfg.NODE_ENV === 'production') {
      if (cfg.JWT_ACCESS_SECRET === cfg.JWT_REFRESH_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'access and refresh secrets must differ in production',
        });
      }
      if (cfg.REDIS_ENABLED && !cfg.REDIS_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['REDIS_URL'],
          message: 'REDIS_URL is required in production unless REDIS_ENABLED=false',
        });
      }
    }
  });

function loadEnv(source = process.env) {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const cfg = parsed.data;
  return {
    ...cfg,
    isProduction: cfg.NODE_ENV === 'production',
    isTest: cfg.NODE_ENV === 'test',
    isDevelopment: cfg.NODE_ENV === 'development',
    requireTransactions: cfg.NODE_ENV === 'production' && cfg.MONGO_REQUIRE_TRANSACTIONS,
    // Redis is only truly on when enabled *and* a URL was supplied.
    redisEnabled: cfg.REDIS_ENABLED && Boolean(cfg.REDIS_URL),
  };
}

const env = loadEnv();

// Attached non-enumerably so `{ ...env }` stays pure configuration and the
// helpers survive the freeze below.
Object.defineProperties(env, {
  loadEnv: { value: loadEnv, enumerable: false },
  envSchema: { value: envSchema, enumerable: false },
});

module.exports = Object.freeze(env);

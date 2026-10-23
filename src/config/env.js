'use strict';

/**
 * Centralised, validated configuration.
 *
 * Every environment variable the application reads is declared and validated
 * here exactly once. The process fails fast at boot if anything required is
 * missing or malformed, instead of failing later at request time.
 */
const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ quiet: true });

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_ISSUER: z.string().default('taskmaster-api'),
    JWT_AUDIENCE: z.string().default('taskmaster-clients'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

    // Comma separated list of allowed browser origins, or "*" for any.
    CORS_ORIGINS: z.string().default('*'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    COOKIE_SECURE: booleanString.optional(),

    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

    UPLOAD_DIR: z.string().default('uploads'),
    MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(10),
    MAX_FILES_PER_UPLOAD: z.coerce.number().int().positive().default(5),

    INVITATION_TTL_DAYS: z.coerce.number().int().positive().default(7),
    NOTIFICATION_TTL_DAYS: z.coerce.number().int().positive().default(90),

    ANTHROPIC_API_KEY: z.string().optional(),
    AI_MODEL: z.string().default('claude-opus-5-5'),
    AI_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  })
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  }));

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  // The logger depends on this module, so plain stderr is used here.
  process.stderr.write(`Invalid environment configuration:\n${details}\n`);
  process.exit(1);
}

const env = parsed.data;

const config = Object.freeze({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  logLevel: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  mongoUri: env.MONGODB_URI,
  jwt: Object.freeze({
    accessSecret: env.JWT_ACCESS_SECRET,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  }),
  refreshTokenTtlMs: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  bcryptSaltRounds: env.BCRYPT_SALT_ROUNDS,
  cors: Object.freeze({
    origins:
      env.CORS_ORIGINS.trim() === '*'
        ? '*'
        : env.CORS_ORIGINS.split(',')
            .map((origin) => origin.trim())
            .filter(Boolean),
  }),
  trustProxy: env.TRUST_PROXY,
  cookieSecure: env.COOKIE_SECURE,
  rateLimit: Object.freeze({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    authMax: env.AUTH_RATE_LIMIT_MAX,
    aiMax: env.AI_RATE_LIMIT_MAX,
  }),
  uploads: Object.freeze({
    dir: path.resolve(process.cwd(), env.UPLOAD_DIR),
    maxFileSizeBytes: Math.floor(env.MAX_UPLOAD_SIZE_MB * 1024 * 1024),
    maxFiles: env.MAX_FILES_PER_UPLOAD,
  }),
  invitationTtlMs: env.INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
  notificationTtlSeconds: env.NOTIFICATION_TTL_DAYS * 24 * 60 * 60,
  ai: Object.freeze({
    apiKey: env.ANTHROPIC_API_KEY || undefined,
    model: env.AI_MODEL,
  }),
});

module.exports = config;

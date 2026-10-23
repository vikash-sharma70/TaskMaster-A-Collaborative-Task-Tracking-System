'use strict';

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const config = require('../config/env');

/**
 * Rate limiters. The default in-memory store is per-process; for horizontally
 * scaled deployments plug a shared store (e.g. rate-limit-redis) in here.
 */
function buildLimiter({ max, keyByUser = false, message }) {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => config.isTest,
    ...(keyByUser && { keyGenerator: (req) => req.auth?.userId ?? ipKeyGenerator(req.ip) }),
    handler: (req, res) =>
      res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message, requestId: req.id },
      }),
  });
}

const apiLimiter = buildLimiter({
  max: config.rateLimit.max,
  message: 'Too many requests, please try again later',
});

/** Brute-force protection for credential endpoints. */
const authLimiter = buildLimiter({
  max: config.rateLimit.authMax,
  message: 'Too many authentication attempts, please try again later',
});

/** AI calls cost money, so they are limited per user rather than per IP. */
const aiLimiter = buildLimiter({
  max: config.rateLimit.aiMax,
  keyByUser: true,
  message: 'AI request quota exceeded, please try again later',
});

module.exports = { apiLimiter, authLimiter, aiLimiter };

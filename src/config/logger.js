'use strict';

const pino = require('pino');
const config = require('./env');

/**
 * Application-wide structured logger.
 * JSON in production (ship to any log aggregator), pretty-printed in development.
 */
const logger = pino({
  level: config.logLevel,
  base: { service: 'taskmaster-api', env: config.env },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.currentPassword',
      '*.newPassword',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[REDACTED]',
  },
  transport:
    config.env === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
});

module.exports = logger;

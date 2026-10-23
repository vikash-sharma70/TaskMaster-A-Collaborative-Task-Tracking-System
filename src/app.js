'use strict';

const fs = require('node:fs');
const path = require('node:path');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');

const { isDatabaseReady } = require('./config/database');
const config = require('./config/env');
const logger = require('./config/logger');
const { errorHandler, notFound } = require('./middlewares/errorHandler');
const { apiLimiter } = require('./middlewares/rateLimiters');
const requestId = require('./middlewares/requestId');
const sanitize = require('./middlewares/sanitize');
const { registerNotificationListeners } = require('./modules/notifications/notification.listeners');
const apiRoutes = require('./routes');

const openApiDocument = YAML.parse(
  fs.readFileSync(path.join(__dirname, 'docs', 'openapi.yaml'), 'utf8'),
);

/**
 * Builds the Express application (without binding a port) so it can be used
 * by the HTTP server and by the integration test-suite alike.
 */
function createApp() {
  registerNotificationListeners();

  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('query parser', 'simple'); // flat query strings only: no nested objects/operators

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: { ignore: (req) => req.url.startsWith('/health') },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use(helmet());
  app.use(
    cors({
      origin: config.cors.origins === '*' ? true : config.cors.origins,
      credentials: true,
      exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
      maxAge: 600,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());
  app.use(sanitize);

  /* ---------------------------- operational endpoints ---------------------------- */
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
  });
  app.get('/health/ready', (_req, res) => {
    const ready = isDatabaseReady();
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', database: ready });
  });

  /* ---------------------------------- API docs ---------------------------------- */
  app.get('/api-docs.json', (_req, res) => res.json(openApiDocument));
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'TaskMaster API',
      swaggerOptions: { persistAuthorization: true },
    }),
  );

  /* ------------------------------------ API ------------------------------------- */
  app.use('/api/v1', apiLimiter, apiRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;

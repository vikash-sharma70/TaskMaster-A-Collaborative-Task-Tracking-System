'use strict';

const http = require('node:http');
const config = require('./config/env');
const logger = require('./config/logger');
const createApp = require('./app');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const { initRealtime } = require('./realtime/socket');
const storage = require('./services/storage');

const SHUTDOWN_TIMEOUT_MS = 15_000;

async function start() {
  storage.ensureStorageDir();
  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);
  // Keep-alive must outlive typical load-balancer idle timeouts (60s).
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  const realtime = initRealtime(server);

  await new Promise((resolve) => server.listen(config.port, resolve));
  logger.info({ port: config.port, env: config.env }, 'TaskMaster API listening');

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down gracefully');

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      await realtime.close();
      // Stop accepting connections, drop idle keep-alives, wait for in-flight requests.
      await new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
      await disconnectDatabase();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception, exiting');
  process.exit(1);
});

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});

'use strict';

const mongoose = require('mongoose');
const config = require('./env');
const logger = require('./logger');

mongoose.set('strictQuery', true);
// Fail loudly when populating a path that is not declared on the schema.
mongoose.set('strictPopulate', true);

let listenersAttached = false;

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));
}

/**
 * Opens the shared Mongoose connection and builds indexes declared on models.
 * @param {string} [uri] Override (used by the test-suite's in-memory server).
 */
async function connectDatabase(uri = config.mongoUri) {
  attachListeners();
  await mongoose.connect(uri, {
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    // Index builds are explicit (below) so boot fails loudly if one cannot be built.
    // createIndexes() is additive only; it never drops indexes created out-of-band.
    autoIndex: false,
  });
  await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));
  return mongoose.connection;
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDatabase, disconnectDatabase, isDatabaseReady };

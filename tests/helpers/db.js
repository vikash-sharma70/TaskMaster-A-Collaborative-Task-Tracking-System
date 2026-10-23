'use strict';

const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../../src/config/database');
const storage = require('../../src/services/storage');

/** Lets queued domain-event handlers (setImmediate + async DB writes) settle. */
async function flushEvents(ms = 60) {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Registers lifecycle hooks giving the current test file an isolated database
 * on the shared in-memory MongoDB server. Collections are emptied after each test.
 */
function useTestDatabase() {
  beforeAll(async () => {
    const base = process.env.TEST_MONGO_BASE_URI.replace(/\/?$/, '/');
    const dbName = `taskmaster_test_${crypto.randomBytes(6).toString('hex')}`;
    storage.ensureStorageDir();
    await connectDatabase(`${base}${dbName}`);
  });

  afterEach(async () => {
    await flushEvents(20);
    await Promise.all(
      Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
    );
  });

  afterAll(async () => {
    await flushEvents(20);
    await mongoose.connection.dropDatabase();
    await disconnectDatabase();
  });
}

module.exports = { useTestDatabase, flushEvents };

'use strict';

const { MongoMemoryServer } = require('mongodb-memory-server');

/** Starts one in-memory MongoDB for the whole run; each test file uses its own database. */
module.exports = async function globalSetup() {
  const mongod = await MongoMemoryServer.create();
  globalThis.__MONGOD__ = mongod;
  process.env.TEST_MONGO_BASE_URI = mongod.getUri();
};

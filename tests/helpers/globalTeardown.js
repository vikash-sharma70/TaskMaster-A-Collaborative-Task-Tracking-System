'use strict';

const fs = require('node:fs');
const path = require('node:path');

module.exports = async function globalTeardown() {
  await globalThis.__MONGOD__?.stop();
  fs.rmSync(path.join(__dirname, '..', '.uploads'), { recursive: true, force: true });
};

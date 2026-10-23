'use strict';

// Loaded before every test file, before any application module is required.
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
process.env.BCRYPT_SALT_ROUNDS = '4';
process.env.UPLOAD_DIR = path.join('tests', '.uploads');
process.env.ANTHROPIC_API_KEY = '';
// Real value is injected per test file by tests/helpers/db.js.
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/placeholder';

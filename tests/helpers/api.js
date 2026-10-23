'use strict';

const request = require('supertest');
const createApp = require('../../src/app');

const app = createApp();
const API = '/api/v1';

let counter = 0;
const DEFAULT_PASSWORD = 'Str0ngPassw0rd';

/** Registers a fresh user and returns its profile plus tokens. */
async function registerUser(overrides = {}) {
  counter += 1;
  const body = {
    name: overrides.name ?? `User ${counter}`,
    email: overrides.email ?? `user${counter}.${Date.now()}@example.com`,
    password: overrides.password ?? DEFAULT_PASSWORD,
  };
  const res = await request(app).post(`${API}/auth/register`).send(body);
  if (res.status !== 201) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const { user, accessToken, refreshToken } = res.body.data;
  return { user, token: accessToken, refreshToken, password: body.password, email: body.email };
}

/** Thin supertest wrapper that prefixes /api/v1 and sets the bearer token. */
function api(token) {
  const withAuth = (req) => (token ? req.set('Authorization', `Bearer ${token}`) : req);
  return {
    get: (url) => withAuth(request(app).get(`${API}${url}`)),
    post: (url) => withAuth(request(app).post(`${API}${url}`)),
    patch: (url) => withAuth(request(app).patch(`${API}${url}`)),
    delete: (url) => withAuth(request(app).delete(`${API}${url}`)),
  };
}

/** Creates a team owned by `owner` and adds each of `members` via the invite code. */
async function createTeamWithMembers(owner, members = [], name = 'Core Team') {
  const created = await api(owner.token).post('/teams').send({ name });
  if (created.status !== 201)
    throw new Error(`team create failed: ${JSON.stringify(created.body)}`);
  const team = created.body.data;
  for (const member of members) {
    const joined = await api(member.token)
      .post('/teams/join')
      .send({ inviteCode: team.inviteCode });
    if (joined.status !== 200) throw new Error(`join failed: ${JSON.stringify(joined.body)}`);
  }
  return team;
}

module.exports = { app, api, request, registerUser, createTeamWithMembers, API, DEFAULT_PASSWORD };

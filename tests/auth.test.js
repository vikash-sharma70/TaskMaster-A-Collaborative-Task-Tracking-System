'use strict';

const { api, registerUser, request, app, API } = require('./helpers/api');
const { useTestDatabase } = require('./helpers/db');

useTestDatabase();

describe('Auth', () => {
  describe('POST /auth/register', () => {
    it('creates an account and returns tokens without the password hash', async () => {
      const res = await api().post('/auth/register').send({
        name: 'Asha Verma',
        email: 'Asha@Example.com',
        password: 'Str0ngPassw0rd',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toMatchObject({ name: 'Asha Verma', email: 'asha@example.com' });
      expect(res.body.data.user.id).toBeDefined();
      expect(res.body.data.user.password).toBeUndefined();
      expect(res.body.data.tokenType).toBe('Bearer');
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(res.body.data.refreshToken).toEqual(expect.any(String));
      expect(res.headers['set-cookie'].join(';')).toMatch(/tm_refresh=.*HttpOnly/i);
    });

    it('rejects a duplicate email with 409', async () => {
      await registerUser({ email: 'dup@example.com' });
      const res = await api()
        .post('/auth/register')
        .send({ name: 'Dup', email: 'DUP@example.com', password: 'Str0ngPassw0rd' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });

    it('validates input and reports every failing field', async () => {
      const res = await api()
        .post('/auth/register')
        .send({ name: 'A', email: 'not-an-email', password: 'weak' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      const fields = res.body.error.details.map((d) => d.field);
      expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
    });

    it('rejects unknown fields (mass-assignment protection)', async () => {
      const res = await api().post('/auth/register').send({
        name: 'Eve',
        email: 'eve@example.com',
        password: 'Str0ngPassw0rd',
        role: 'admin',
      });
      expect(res.status).toBe(422);
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with valid credentials', async () => {
      const { email, password } = await registerUser();
      const res = await api().post('/auth/login').send({ email, password });
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe(email);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
    });

    it('returns the same 401 for wrong password and unknown email', async () => {
      const { email } = await registerUser();
      const wrongPassword = await api().post('/auth/login').send({ email, password: 'Nope12345' });
      const unknownEmail = await api()
        .post('/auth/login')
        .send({ email: 'ghost@example.com', password: 'Nope12345' });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
    });

    it('blocks NoSQL operator injection', async () => {
      await registerUser();
      const res = await api()
        .post('/auth/login')
        .send({ email: { $gt: '' }, password: { $gt: '' } });
      expect(res.status).toBe(422);
    });
  });

  describe('protected routes', () => {
    it('require a bearer token', async () => {
      const res = await api().get('/users/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('reject a tampered token', async () => {
      const { token } = await registerUser();
      const res = await api(`${token.slice(0, -2)}xx`).get('/users/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the refresh token and detects reuse of the old one', async () => {
      const { refreshToken } = await registerUser();

      const first = await api().post('/auth/refresh').send({ refreshToken });
      expect(first.status).toBe(200);
      expect(first.body.data.refreshToken).not.toBe(refreshToken);

      // Replaying the rotated token is treated as theft: the whole session is revoked...
      const replay = await api().post('/auth/refresh').send({ refreshToken });
      expect(replay.status).toBe(401);
      expect(replay.body.error.code).toBe('INVALID_REFRESH_TOKEN');

      // ...so even the legitimately rotated token and its access token stop working.
      const afterTheft = await api().post('/auth/refresh').send({
        refreshToken: first.body.data.refreshToken,
      });
      expect(afterTheft.status).toBe(401);
      const me = await api(first.body.data.accessToken).get('/users/me');
      expect(me.status).toBe(401);
    });

    it('accepts the refresh token from the httpOnly cookie', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({ name: 'Cookie User', email: 'cookie@example.com', password: 'Str0ngPassw0rd' });
      const cookie = res.headers['set-cookie'].find((c) => c.startsWith('tm_refresh='));

      const refreshed = await request(app)
        .post(`${API}/auth/refresh`)
        .set('Cookie', cookie.split(';')[0]);
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.data.accessToken).toEqual(expect.any(String));
    });

    it('rejects malformed refresh tokens', async () => {
      const res = await api().post('/auth/refresh').send({ refreshToken: 'garbage' });
      expect(res.status).toBe(401);
    });
  });

  describe('logout', () => {
    it('revokes the current session immediately', async () => {
      const { token, refreshToken } = await registerUser();

      const logout = await api(token).post('/auth/logout');
      expect(logout.status).toBe(204);

      const me = await api(token).get('/users/me');
      expect(me.status).toBe(401);
      expect(me.body.error.code).toBe('SESSION_REVOKED');

      const refresh = await api().post('/auth/refresh').send({ refreshToken });
      expect(refresh.status).toBe(401);
    });

    it('logout-all revokes every session of the user', async () => {
      const { email, password, token } = await registerUser();
      const second = await api().post('/auth/login').send({ email, password });

      const sessions = await api(token).get('/auth/sessions');
      expect(sessions.body.data).toHaveLength(2);
      expect(sessions.body.data.filter((s) => s.current)).toHaveLength(1);

      expect((await api(token).post('/auth/logout-all')).status).toBe(204);
      expect((await api(token).get('/users/me')).status).toBe(401);
      expect((await api(second.body.data.accessToken).get('/users/me')).status).toBe(401);
    });
  });
});

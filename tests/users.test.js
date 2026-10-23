'use strict';

const { api, registerUser, createTeamWithMembers } = require('./helpers/api');
const { useTestDatabase } = require('./helpers/db');

useTestDatabase();

describe('Users / profile', () => {
  it('returns my profile', async () => {
    const { token, user } = await registerUser({ name: 'Ravi Kumar' });
    const res = await api(token).get('/users/me');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: user.id, name: 'Ravi Kumar', bio: null });
    expect(res.body.data.password).toBeUndefined();
  });

  it('updates profile fields', async () => {
    const { token } = await registerUser();
    const res = await api(token)
      .patch('/users/me')
      .send({ name: 'New Name', bio: 'Backend dev', avatarUrl: 'https://cdn.example.com/a.png' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: 'New Name',
      bio: 'Backend dev',
      avatarUrl: 'https://cdn.example.com/a.png',
    });
  });

  it('does not allow changing email/password through the profile endpoint', async () => {
    const { token } = await registerUser();
    const res = await api(token).patch('/users/me').send({ email: 'x@example.com' });
    expect(res.status).toBe(422);
  });

  it('rejects non-http avatar URLs', async () => {
    const { token } = await registerUser();
    const res = await api(token).patch('/users/me').send({ avatarUrl: 'javascript:alert(1)' });
    expect(res.status).toBe(422);
  });

  describe('PATCH /users/me/password', () => {
    it('changes the password and signs out other sessions only', async () => {
      const { token, email, password } = await registerUser();
      const other = await api().post('/auth/login').send({ email, password });

      const res = await api(token)
        .patch('/users/me/password')
        .send({ currentPassword: password, newPassword: 'An0therStrongOne' });
      expect(res.status).toBe(204);

      expect((await api(token).get('/users/me')).status).toBe(200);
      expect((await api(other.body.data.accessToken).get('/users/me')).status).toBe(401);
      expect((await api().post('/auth/login').send({ email, password })).status).toBe(401);
      expect(
        (await api().post('/auth/login').send({ email, password: 'An0therStrongOne' })).status,
      ).toBe(200);
    });

    it('requires the correct current password', async () => {
      const { token } = await registerUser();
      const res = await api(token)
        .patch('/users/me/password')
        .send({ currentPassword: 'Wrong12345', newPassword: 'An0therStrongOne' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /users/:userId', () => {
    it('shows teammates but hides strangers', async () => {
      const alice = await registerUser();
      const bob = await registerUser();
      const stranger = await registerUser();
      await createTeamWithMembers(alice, [bob]);

      const teammate = await api(alice.token).get(`/users/${bob.user.id}`);
      expect(teammate.status).toBe(200);
      expect(teammate.body.data.name).toBe(bob.user.name);

      const hidden = await api(alice.token).get(`/users/${stranger.user.id}`);
      expect(hidden.status).toBe(404);
    });

    it('rejects malformed ids', async () => {
      const { token } = await registerUser();
      const res = await api(token).get('/users/not-an-id');
      expect(res.status).toBe(422);
    });
  });
});

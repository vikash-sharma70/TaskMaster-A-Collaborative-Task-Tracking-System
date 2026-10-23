'use strict';

const { api, registerUser, createTeamWithMembers } = require('./helpers/api');
const { useTestDatabase } = require('./helpers/db');

useTestDatabase();

describe('Teams', () => {
  let owner;
  let alice;
  let bob;

  beforeEach(async () => {
    owner = await registerUser({ name: 'Owner' });
    alice = await registerUser({ name: 'Alice' });
    bob = await registerUser({ name: 'Bob' });
  });

  it('creates a team with the creator as owner', async () => {
    const res = await api(owner.token)
      .post('/teams')
      .send({ name: 'Platform', description: 'Platform squad' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: 'Platform', myRole: 'owner', memberCount: 1 });
    expect(res.body.data.inviteCode).toMatch(/^[A-Z2-9]{10}$/);
    expect(res.body.data.members[0].user.id).toBe(owner.user.id);
  });

  it('lists only the teams I belong to, with my role', async () => {
    await createTeamWithMembers(owner, [alice], 'Alpha');
    await createTeamWithMembers(bob, [], 'Bravo');

    const res = await api(alice.token).get('/teams');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ name: 'Alpha', myRole: 'member', memberCount: 2 });
    expect(res.body.meta).toMatchObject({ page: 1, total: 1 });
  });

  it('hides the invite code from plain members and the team from outsiders', async () => {
    const team = await createTeamWithMembers(owner, [alice]);

    const asMember = await api(alice.token).get(`/teams/${team.id}`);
    expect(asMember.status).toBe(200);
    expect(asMember.body.data.inviteCode).toBeUndefined();

    const asOutsider = await api(bob.token).get(`/teams/${team.id}`);
    expect(asOutsider.status).toBe(404);
  });

  it('lets only owner/admin update the team', async () => {
    const team = await createTeamWithMembers(owner, [alice]);
    const forbidden = await api(alice.token).patch(`/teams/${team.id}`).send({ name: 'Hacked' });
    expect(forbidden.status).toBe(403);

    const ok = await api(owner.token).patch(`/teams/${team.id}`).send({ name: 'Renamed' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.name).toBe('Renamed');
  });

  describe('joining', () => {
    it('joins with an invite code and rejects joining twice', async () => {
      const team = await createTeamWithMembers(owner);
      const joined = await api(alice.token)
        .post('/teams/join')
        .send({ inviteCode: team.inviteCode });
      expect(joined.status).toBe(200);
      expect(joined.body.data.myRole).toBe('member');

      const again = await api(alice.token)
        .post('/teams/join')
        .send({ inviteCode: team.inviteCode });
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('ALREADY_MEMBER');
    });

    it('invalidates the old code when regenerated', async () => {
      const team = await createTeamWithMembers(owner);
      const regenerated = await api(owner.token).post(`/teams/${team.id}/invite-code`);
      expect(regenerated.status).toBe(200);
      expect(regenerated.body.data.inviteCode).not.toBe(team.inviteCode);

      const stale = await api(alice.token)
        .post('/teams/join')
        .send({ inviteCode: team.inviteCode });
      expect(stale.status).toBe(404);
    });
  });

  describe('invitations', () => {
    it('invites by email; the invitee can see and accept it', async () => {
      const team = await createTeamWithMembers(owner);
      const invite = await api(owner.token)
        .post(`/teams/${team.id}/invitations`)
        .send({ email: alice.email });
      expect(invite.status).toBe(201);
      expect(invite.body.data).toMatchObject({ status: 'pending', role: 'member' });

      const inbox = await api(alice.token).get('/invitations');
      expect(inbox.body.data).toHaveLength(1);
      expect(inbox.body.data[0].team.name).toBe(team.name);

      const accepted = await api(alice.token).post(`/invitations/${invite.body.data.id}/accept`);
      expect(accepted.status).toBe(200);
      expect(accepted.body.data.invitation.status).toBe('accepted');
      expect(accepted.body.data.team.myRole).toBe('member');

      const members = await api(owner.token).get(`/teams/${team.id}/members`);
      expect(members.body.data.map((m) => m.user.id)).toContain(alice.user.id);
    });

    it('prevents duplicate pending invitations and inviting existing members', async () => {
      const team = await createTeamWithMembers(owner, [bob]);
      await api(owner.token).post(`/teams/${team.id}/invitations`).send({ email: alice.email });

      const dup = await api(owner.token)
        .post(`/teams/${team.id}/invitations`)
        .send({ email: alice.email });
      expect(dup.status).toBe(409);

      const member = await api(owner.token)
        .post(`/teams/${team.id}/invitations`)
        .send({ email: bob.email });
      expect(member.status).toBe(409);
    });

    it("does not let another user accept someone else's invitation", async () => {
      const team = await createTeamWithMembers(owner);
      const invite = await api(owner.token)
        .post(`/teams/${team.id}/invitations`)
        .send({ email: alice.email });
      const res = await api(bob.token).post(`/invitations/${invite.body.data.id}/accept`);
      expect(res.status).toBe(404);
    });

    it('supports declining and revoking', async () => {
      const team = await createTeamWithMembers(owner);
      const one = await api(owner.token)
        .post(`/teams/${team.id}/invitations`)
        .send({ email: alice.email });
      const declined = await api(alice.token).post(`/invitations/${one.body.data.id}/decline`);
      expect(declined.body.data.invitation.status).toBe('declined');

      const two = await api(owner.token)
        .post(`/teams/${team.id}/invitations`)
        .send({ email: bob.email });
      const revoked = await api(owner.token).delete(
        `/teams/${team.id}/invitations/${two.body.data.id}`,
      );
      expect(revoked.body.data.status).toBe('revoked');
      expect((await api(bob.token).post(`/invitations/${two.body.data.id}/accept`)).status).toBe(
        404,
      );

      const listed = await api(owner.token).get(`/teams/${team.id}/invitations?status=revoked`);
      expect(listed.body.data).toHaveLength(1);
    });

    it('only lets the owner invite admins', async () => {
      const team = await createTeamWithMembers(owner, [alice]);
      await api(owner.token)
        .patch(`/teams/${team.id}/members/${alice.user.id}`)
        .send({ role: 'admin' });

      const asAdmin = await api(alice.token)
        .post(`/teams/${team.id}/invitations`)
        .send({ email: bob.email, role: 'admin' });
      expect(asAdmin.status).toBe(403);

      const asAdminMember = await api(alice.token)
        .post(`/teams/${team.id}/invitations`)
        .send({ email: bob.email });
      expect(asAdminMember.status).toBe(201);
    });
  });

  describe('membership management', () => {
    it('removing a member unassigns their tasks in that team', async () => {
      const team = await createTeamWithMembers(owner, [alice]);
      const task = await api(owner.token)
        .post('/tasks')
        .send({ title: 'Ship it', team: team.id, assignee: alice.user.id });

      const removed = await api(owner.token).delete(`/teams/${team.id}/members/${alice.user.id}`);
      expect(removed.status).toBe(204);

      const after = await api(owner.token).get(`/tasks/${task.body.data.id}`);
      expect(after.body.data.assignee).toBeNull();
      expect((await api(alice.token).get(`/teams/${team.id}`)).status).toBe(404);
    });

    it('lets members leave but not the owner', async () => {
      const team = await createTeamWithMembers(owner, [alice]);
      expect((await api(alice.token).post(`/teams/${team.id}/leave`)).status).toBe(204);
      expect((await api(owner.token).post(`/teams/${team.id}/leave`)).status).toBe(400);
    });

    it('stops admins from removing other admins', async () => {
      const team = await createTeamWithMembers(owner, [alice, bob]);
      for (const user of [alice, bob]) {
        await api(owner.token)
          .patch(`/teams/${team.id}/members/${user.user.id}`)
          .send({ role: 'admin' });
      }
      const res = await api(alice.token).delete(`/teams/${team.id}/members/${bob.user.id}`);
      expect(res.status).toBe(403);
    });
  });

  it('deleting a team (owner only) removes its tasks', async () => {
    const team = await createTeamWithMembers(owner, [alice]);
    const task = await api(alice.token).post('/tasks').send({ title: 'Team task', team: team.id });

    expect((await api(alice.token).delete(`/teams/${team.id}`)).status).toBe(403);
    expect((await api(owner.token).delete(`/teams/${team.id}`)).status).toBe(204);
    expect((await api(alice.token).get(`/tasks/${task.body.data.id}`)).status).toBe(404);
    expect((await api(owner.token).get('/teams')).body.data).toHaveLength(0);
  });
});

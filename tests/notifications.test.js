'use strict';

const { api, registerUser, createTeamWithMembers } = require('./helpers/api');
const { useTestDatabase, flushEvents } = require('./helpers/db');

useTestDatabase();

describe('Notifications', () => {
  let owner;
  let alice;
  let team;

  beforeEach(async () => {
    owner = await registerUser({ name: 'Owner' });
    alice = await registerUser({ name: 'Alice' });
    team = await createTeamWithMembers(owner, [alice]);
    await flushEvents();
    // Ignore the "member joined" notification created during setup.
    await api(owner.token).patch('/notifications/read-all');
  });

  const inbox = async (user, query = '') =>
    (await api(user.token).get(`/notifications${query}`)).body;

  it('notifies the assignee when a task is assigned, but never the actor', async () => {
    await api(owner.token)
      .post('/tasks')
      .send({ title: 'Prepare demo', team: team.id, assignee: alice.user.id });
    await flushEvents();

    const aliceInbox = await inbox(alice);
    expect(aliceInbox.data).toHaveLength(1);
    expect(aliceInbox.data[0]).toMatchObject({
      type: 'task_assigned',
      message: 'Owner assigned you "Prepare demo"',
      readAt: null,
    });
    expect(aliceInbox.data[0].actor).toMatchObject({ id: owner.user.id, name: 'Owner' });
    expect(aliceInbox.meta.unreadCount).toBe(1);

    expect((await inbox(owner, '?unread=true')).data).toHaveLength(0);
  });

  it('notifies creator when the assignee completes the task or comments', async () => {
    const { body } = await api(owner.token)
      .post('/tasks')
      .send({ title: 'Deploy', team: team.id, assignee: alice.user.id });

    await api(alice.token).patch(`/tasks/${body.data.id}/status`).send({ status: 'completed' });
    await api(alice.token).post(`/tasks/${body.data.id}/comments`).send({ body: 'Done!' });
    await flushEvents();

    const types = (await inbox(owner, '?unread=true')).data.map((n) => n.type).sort();
    expect(types).toEqual(['comment_added', 'task_completed']);
  });

  it('notifies watchers about general updates with the changed fields', async () => {
    const { body } = await api(alice.token)
      .post('/tasks')
      .send({ title: 'Refactor', team: team.id, assignee: alice.user.id });
    await api(owner.token).patch(`/tasks/${body.data.id}`).send({ priority: 'urgent' });
    await flushEvents();

    const [notification] = (await inbox(alice, '?type=task_updated')).data;
    expect(notification.data.changes).toEqual(['priority']);
  });

  it('sends a team invitation notification to registered invitees', async () => {
    const bob = await registerUser({ name: 'Bob' });
    await api(owner.token).post(`/teams/${team.id}/invitations`).send({ email: bob.email });
    await flushEvents();

    const [notification] = (await inbox(bob)).data;
    expect(notification.type).toBe('team_invitation');
    expect(notification.data.invitationId).toEqual(expect.any(String));
  });

  it('marks notifications read individually and in bulk', async () => {
    for (const title of ['A', 'B', 'C']) {
      await api(owner.token).post('/tasks').send({ title, team: team.id, assignee: alice.user.id });
    }
    await flushEvents();

    const { data } = await inbox(alice);
    expect(data).toHaveLength(3);

    const one = await api(alice.token).patch(`/notifications/${data[0].id}/read`);
    expect(one.body.data.readAt).toEqual(expect.any(String));
    expect((await api(alice.token).get('/notifications/unread-count')).body.data.unreadCount).toBe(
      2,
    );

    const all = await api(alice.token).patch('/notifications/read-all');
    expect(all.body.data.updated).toBe(2);
    expect((await api(alice.token).get('/notifications/unread-count')).body.data.unreadCount).toBe(
      0,
    );

    expect((await api(alice.token).delete(`/notifications/${data[1].id}`)).status).toBe(204);
    expect((await inbox(alice)).data).toHaveLength(2);
  });

  it("does not expose other users' notifications", async () => {
    await api(owner.token)
      .post('/tasks')
      .send({ title: 'X', team: team.id, assignee: alice.user.id });
    await flushEvents();
    const [notification] = (await inbox(alice)).data;

    expect((await api(owner.token).patch(`/notifications/${notification.id}/read`)).status).toBe(
      404,
    );
    expect((await api(owner.token).delete(`/notifications/${notification.id}`)).status).toBe(404);
  });
});

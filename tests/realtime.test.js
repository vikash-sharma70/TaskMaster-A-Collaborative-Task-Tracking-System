'use strict';

const http = require('node:http');
const { io: connect } = require('socket.io-client');
const { initRealtime } = require('../src/realtime/socket');
const { app, api, registerUser, createTeamWithMembers } = require('./helpers/api');
const { useTestDatabase } = require('./helpers/db');

useTestDatabase();

/** Resolves with the payload of the next `event` on `socket`, or rejects on timeout. */
function nextEvent(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('Real-time updates (Socket.IO)', () => {
  let server;
  let realtime;
  let url;
  const sockets = [];

  beforeAll(async () => {
    server = http.createServer(app);
    realtime = initRealtime(server);
    await new Promise((resolve) => server.listen(0, resolve));
    url = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(() => {
    while (sockets.length) sockets.pop().disconnect();
  });

  afterAll(async () => {
    await realtime.close();
    await new Promise((resolve) => server.close(resolve));
  });

  async function openSocket(token) {
    const socket = connect(url, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    const ready = await nextEvent(socket, 'ready');
    return { socket, ready };
  }

  it('rejects connections without a valid token', async () => {
    const socket = connect(url, {
      auth: { token: 'bad' },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    const err = await nextEvent(socket, 'connect_error');
    expect(err.data.code).toBe('INVALID_TOKEN');
  });

  it('pushes a notification when a task is assigned to me', async () => {
    const owner = await registerUser({ name: 'Owner' });
    const alice = await registerUser({ name: 'Alice' });
    const team = await createTeamWithMembers(owner, [alice]);

    const { socket, ready } = await openSocket(alice.token);
    expect(ready.teams).toContain(team.id);

    const notification = nextEvent(socket, 'notification:new');
    const taskCreated = nextEvent(socket, 'task:created');
    await api(owner.token)
      .post('/tasks')
      .send({ title: 'Live task', team: team.id, assignee: alice.user.id });

    expect(await notification).toMatchObject({
      type: 'task_assigned',
      recipient: alice.user.id,
      message: 'Owner assigned you "Live task"',
    });
    expect((await taskCreated).task.title).toBe('Live task');
  });

  it('broadcasts task updates to the whole team, including newly joined members', async () => {
    const owner = await registerUser({ name: 'Owner' });
    const bob = await registerUser({ name: 'Bob' });
    const team = await createTeamWithMembers(owner);

    // Bob connects before joining: his socket must be added to the team room on join.
    const { socket } = await openSocket(bob.token);
    await api(bob.token).post('/teams/join').send({ inviteCode: team.inviteCode });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const { body } = await api(owner.token).post('/tasks').send({ title: 'Board', team: team.id });
    const updated = nextEvent(socket, 'task:updated');
    await api(owner.token).patch(`/tasks/${body.data.id}`).send({ status: 'in_progress' });

    expect(await updated).toMatchObject({ changes: ['status'], task: { status: 'in_progress' } });
  });

  it('disconnects the socket when its session logs out', async () => {
    const user = await registerUser();
    const { socket } = await openSocket(user.token);

    const disconnected = nextEvent(socket, 'disconnect');
    await api(user.token).post('/auth/logout');
    expect(await disconnected).toBe('io server disconnect');
  });
});

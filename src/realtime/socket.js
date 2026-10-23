'use strict';

const { Server } = require('socket.io');
const config = require('../config/env');
const logger = require('../config/logger');
const { EVENTS } = require('../constants');
const eventBus = require('../events/eventBus');
const { extractBearer } = require('../middlewares/authenticate');
const { authenticateAccessToken } = require('../modules/auth/auth.service');
const { getUserTeamIds } = require('../modules/teams/team.access');
const serialize = require('../utils/serialize');

/**
 * Real-time gateway (Socket.IO).
 *
 * Clients authenticate with their access token during the handshake:
 *   io(URL, { auth: { token: '<accessToken>' } })
 *
 * Every socket joins:
 *   user:<userId>       personal notifications
 *   session:<sessionId> so logout can disconnect exactly that session
 *   team:<teamId>       live updates for each team the user belongs to
 *
 * Server -> client events:
 *   notification:new, task:created, task:updated, task:deleted,
 *   comment:created, comment:updated, comment:deleted,
 *   attachment:added, attachment:deleted,
 *   team:member_joined, team:member_removed, team:deleted
 *
 * For multiple API instances attach @socket.io/redis-adapter so room
 * broadcasts reach sockets connected to other nodes.
 */
const room = {
  user: (id) => `user:${id}`,
  session: (id) => `session:${id}`,
  team: (id) => `team:${id}`,
};

const idOf = (value) => (value == null ? null : String(value._id ?? value));

/** Team tasks broadcast to the team room; personal tasks only to their owner. */
function taskRooms(task) {
  if (task.team) return [room.team(idOf(task.team))];
  return [...new Set([idOf(task.createdBy), idOf(task.assignee)].filter(Boolean))].map(room.user);
}

function authMiddleware() {
  return async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token || extractBearer(socket.handshake.headers?.authorization);
      if (!token) throw Object.assign(new Error('Missing access token'), { code: 'UNAUTHORIZED' });
      const { user, sessionId } = await authenticateAccessToken(token);
      socket.data.userId = String(user._id);
      socket.data.sessionId = String(sessionId);
      return next();
    } catch (err) {
      const error = new Error(err.message || 'Unauthorized');
      error.data = { code: err.code || 'UNAUTHORIZED' };
      return next(error);
    }
  };
}

function wireDomainEvents(io) {
  const subscriptions = [];
  const on = (event, handler) => subscriptions.push(eventBus.subscribe(event, handler));
  const emitTo = (rooms, event, payload) => {
    if (!rooms.length) return;
    io.to(rooms).emit(event, serialize(payload));
  };

  on(EVENTS.NOTIFICATIONS_CREATED, (notifications) => {
    for (const notification of notifications) {
      emitTo([room.user(idOf(notification.recipient))], 'notification:new', notification);
    }
  });

  on(EVENTS.TASK_CREATED, ({ task, actor }) =>
    emitTo(taskRooms(task), 'task:created', { task, actor }),
  );
  on(EVENTS.TASK_UPDATED, ({ task, actor, changes }) =>
    emitTo(taskRooms(task), 'task:updated', { task, actor, changes }),
  );
  on(EVENTS.TASK_DELETED, ({ task, actor }) =>
    emitTo(taskRooms(task), 'task:deleted', { taskId: task._id, actor }),
  );

  for (const [event, name] of [
    [EVENTS.COMMENT_CREATED, 'comment:created'],
    [EVENTS.COMMENT_UPDATED, 'comment:updated'],
    [EVENTS.COMMENT_DELETED, 'comment:deleted'],
  ]) {
    on(event, ({ task, comment, actor }) =>
      emitTo(taskRooms(task), name, { taskId: task._id, comment, actor }),
    );
  }

  on(EVENTS.ATTACHMENTS_ADDED, ({ task, attachments, actor }) =>
    emitTo(taskRooms(task), 'attachment:added', { taskId: task._id, attachments, actor }),
  );
  on(EVENTS.ATTACHMENT_DELETED, ({ task, attachment, actor }) =>
    emitTo(taskRooms(task), 'attachment:deleted', { taskId: task._id, attachment, actor }),
  );

  // Keep room membership in sync with team membership for already-connected sockets.
  on(EVENTS.TEAM_CREATED, ({ teamId, userId }) => {
    io.in(room.user(userId)).socketsJoin(room.team(teamId));
  });
  on(EVENTS.TEAM_MEMBER_JOINED, ({ team, userId, actor }) => {
    io.in(room.user(userId)).socketsJoin(room.team(idOf(team)));
    emitTo([room.team(idOf(team))], 'team:member_joined', { teamId: team._id, userId, actor });
  });
  on(EVENTS.TEAM_MEMBER_REMOVED, ({ teamId, userId, actor }) => {
    io.in(room.user(userId)).socketsLeave(room.team(teamId));
    emitTo([room.team(teamId), room.user(userId)], 'team:member_removed', {
      teamId,
      userId,
      actor,
    });
  });
  on(EVENTS.TEAM_DELETED, ({ team, actor }) => {
    const teamRoom = room.team(idOf(team));
    emitTo([teamRoom], 'team:deleted', { teamId: team._id, actor });
    io.in(teamRoom).socketsLeave(teamRoom);
  });

  // Logging out must also terminate live connections of that session.
  on(EVENTS.SESSIONS_REVOKED, async ({ sessionId, userId, exceptSessionId }) => {
    if (sessionId) {
      io.in(room.session(sessionId)).disconnectSockets(true);
      return;
    }
    const sockets = await io.in(room.user(userId)).fetchSockets();
    for (const socket of sockets) {
      if (socket.data.sessionId !== exceptSessionId) socket.disconnect(true);
    }
  });

  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}

/**
 * Attaches Socket.IO to the HTTP server.
 * @param {import('node:http').Server} httpServer
 * @returns {{ io: Server, close: () => Promise<void> }}
 */
function initRealtime(httpServer) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    cors: {
      origin: config.cors.origins === '*' ? true : config.cors.origins,
      credentials: true,
    },
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 1e5,
  });

  io.use(authMiddleware());

  io.on('connection', async (socket) => {
    const { userId, sessionId } = socket.data;
    try {
      const teamIds = await getUserTeamIds(userId);
      socket.join([
        room.user(userId),
        room.session(sessionId),
        ...teamIds.map((id) => room.team(id)),
      ]);
      socket.emit('ready', { userId, teams: teamIds.map(String) });
      logger.debug({ userId, socketId: socket.id }, 'Socket connected');
    } catch (err) {
      logger.error({ err, userId }, 'Failed to initialise socket');
      socket.disconnect(true);
    }
  });

  const unsubscribe = wireDomainEvents(io);
  return {
    io,
    close: async () => {
      unsubscribe();
      io.disconnectSockets(true);
      // io.close() would also close the shared HTTP server; that is owned by server.js.
      io.engine.close();
    },
  };
}

module.exports = { initRealtime };

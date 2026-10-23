'use strict';

const mongoose = require('mongoose');
const { EVENTS, TASK_STATUS } = require('../../constants');
const eventBus = require('../../events/eventBus');
const ApiError = require('../../utils/ApiError');
const { paginate } = require('../../utils/pagination');
const access = require('../teams/team.access');
const User = require('../users/user.model');
const { deleteTasksCascade } = require('./task.cleanup');
const Task = require('./task.model');
const { loadTask, resolvePermissions } = require('./task.policy');

const { ObjectId } = mongoose.Types;

/** Fields a client may change through the update endpoints. */
const UPDATABLE_FIELDS = [
  'title',
  'description',
  'status',
  'priority',
  'dueDate',
  'tags',
  'assignee',
];

const POPULATE = [
  { path: 'createdBy', select: User.PUBLIC_FIELDS },
  { path: 'assignee', select: User.PUBLIC_FIELDS },
  { path: 'team', select: 'name' },
];

const SORTS = {
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  dueDate: 'dueDate',
  priority: 'priorityRank',
  title: 'title',
  status: 'status',
};

const actorOf = (user) => ({ _id: user._id, name: user.name });
const idOf = (value) => (value == null ? null : String(value._id ?? value));

function invalidAssignee(message) {
  return new ApiError(422, 'INVALID_ASSIGNEE', message);
}

/**
 * Team tasks may be assigned to any team member. Personal tasks belong to a
 * single user, so they may only be assigned to their creator.
 */
async function assertAssignable({ teamId, creatorId, assigneeId }) {
  if (assigneeId == null) return;
  if (!teamId) {
    if (String(assigneeId) !== String(creatorId)) {
      throw invalidAssignee(
        'Personal tasks can only be assigned to yourself; create the task in a team to assign it to others',
      );
    }
    return;
  }
  if (!(await access.areMembers(teamId, [assigneeId]))) {
    throw invalidAssignee("Assignee must be a member of the task's team");
  }
}

async function findPopulated(taskId) {
  return Task.findById(taskId).populate(POPULATE).lean();
}

async function createTask(user, data) {
  if (data.team) await access.getMembership(data.team, user._id);
  await assertAssignable({ teamId: data.team, creatorId: user._id, assigneeId: data.assignee });

  const task = await Task.create({ ...data, createdBy: user._id });
  eventBus.publish(EVENTS.TASK_CREATED, { task: task.toObject(), actor: actorOf(user) });
  return findPopulated(task._id);
}

/** Builds the MongoDB filter for the list endpoint from validated query params. */
async function buildListFilter(userId, query) {
  const me = new ObjectId(String(userId));
  const filter = {};

  if (query.team) {
    await access.getMembership(query.team, userId);
    filter.team = new ObjectId(query.team);
  } else {
    // Visibility: my personal tasks + every task of every team I belong to.
    const teamIds = await access.getUserTeamIds(userId);
    filter.$or = [{ team: null, createdBy: me }, { team: { $in: teamIds } }];
  }

  if (query.status?.length) filter.status = { $in: query.status };
  if (query.priority?.length) filter.priority = { $in: query.priority };
  if (query.tags?.length) filter.tags = { $all: query.tags };

  if (query.assignee === 'me') filter.assignee = me;
  else if (query.assignee === 'unassigned') filter.assignee = null;
  else if (query.assignee) filter.assignee = new ObjectId(query.assignee);

  if (query.createdBy === 'me') filter.createdBy = me;
  else if (query.createdBy) filter.createdBy = new ObjectId(query.createdBy);

  const due = {};
  if (query.dueAfter) due.$gte = query.dueAfter;
  if (query.dueBefore) due.$lte = query.dueBefore;
  if (query.overdue) {
    due.$lt = new Date();
    filter.status = { ...filter.status, $ne: TASK_STATUS.COMPLETED };
  }
  if (Object.keys(due).length) filter.dueDate = due;

  if (query.search) filter.$text = { $search: query.search };
  return filter;
}

function buildSort(query) {
  const raw = query.sort ?? (query.search ? 'relevance' : '-createdAt');
  if (raw === 'relevance') {
    if (!query.search) throw ApiError.badRequest('sort=relevance requires a search term');
    return { score: { $meta: 'textScore' }, _id: -1 };
  }
  const desc = raw.startsWith('-');
  const field = SORTS[desc ? raw.slice(1) : raw];
  // _id tie-breaker keeps pagination stable when sort values are equal.
  return { [field]: desc ? -1 : 1, _id: desc ? -1 : 1 };
}

async function listTasks(userId, query) {
  const filter = await buildListFilter(userId, query);
  const sort = buildSort(query);
  const projection = query.search ? { score: { $meta: 'textScore' } } : {};

  return paginate(Task, filter, query, (q) => q.select(projection).sort(sort).populate(POPULATE));
}

async function getTask(taskId, userId) {
  const { permissions } = await loadTask(taskId, userId);
  const task = await findPopulated(taskId);
  if (!task) throw ApiError.notFound('Task');
  return {
    ...task,
    permissions: {
      canEdit: permissions.canEdit,
      canDelete: permissions.canDelete,
      canAssign: permissions.canEdit,
    },
  };
}

/**
 * Applies a partial update. Only fields that actually change are written and
 * reported in the published event, so notifications describe real changes.
 */
async function updateTask(taskId, user, updates) {
  const { task } = await loadTask(taskId, user._id, { lean: false, require: 'edit' });

  if (Object.hasOwn(updates, 'assignee')) {
    await assertAssignable({
      teamId: task.team,
      creatorId: task.createdBy,
      assigneeId: updates.assignee,
    });
  }

  const previous = { status: task.status, assignee: idOf(task.assignee) };
  for (const field of UPDATABLE_FIELDS) {
    if (Object.hasOwn(updates, field)) task.set(field, updates[field]);
  }
  const changes = UPDATABLE_FIELDS.filter((field) => task.isModified(field));
  if (!changes.length) return findPopulated(task._id);

  await task.save();
  eventBus.publish(EVENTS.TASK_UPDATED, {
    task: task.toObject(),
    actor: actorOf(user),
    changes,
    previous,
  });
  return findPopulated(task._id);
}

async function deleteTask(taskId, user) {
  const { task } = await loadTask(taskId, user._id, { require: 'delete' });
  await deleteTasksCascade([task._id]);
  eventBus.publish(EVENTS.TASK_DELETED, { task, actor: actorOf(user) });
}

/** Dashboard counters for the caller (optionally scoped to one team). */
async function getStats(userId, { team }) {
  const filter = await buildListFilter(userId, { team });
  const me = new ObjectId(String(userId));
  const now = new Date();
  const notCompleted = { $ne: ['$status', TASK_STATUS.COMPLETED] };

  const [stats] = await Task.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        open: { $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.OPEN] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.IN_PROGRESS] }, 1, 0] } },
        completed: { $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.COMPLETED] }, 1, 0] } },
        assignedToMe: { $sum: { $cond: [{ $eq: ['$assignee', me] }, 1, 0] } },
        assignedToMeOpen: {
          $sum: { $cond: [{ $and: [{ $eq: ['$assignee', me] }, notCompleted] }, 1, 0] },
        },
        overdue: {
          $sum: {
            $cond: [
              { $and: [notCompleted, { $ne: ['$dueDate', null] }, { $lt: ['$dueDate', now] }] },
              1,
              0,
            ],
          },
        },
      },
    },
    { $project: { _id: 0 } },
  ]);

  return (
    stats ?? {
      total: 0,
      open: 0,
      inProgress: 0,
      completed: 0,
      assignedToMe: 0,
      assignedToMeOpen: 0,
      overdue: 0,
    }
  );
}

module.exports = {
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
  getStats,
  resolvePermissions,
};

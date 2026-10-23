'use strict';

const { z } = require('zod');
const { TASK_PRIORITY, TASK_STATUS } = require('../../constants');
const { idParam, objectId, paginationQuery, queryBoolean } = require('../../utils/validators');

const status = z.enum(Object.values(TASK_STATUS));
const priority = z.enum(Object.values(TASK_PRIORITY));

/** ISO-8601 date ("2026-11-01") or date-time with offset ("2026-11-01T17:00:00Z"). */
const isoDate = z
  .union([z.string().datetime({ offset: true }), z.string().date()], {
    errorMap: () => ({ message: 'Must be an ISO-8601 date or date-time' }),
  })
  .transform((value) => new Date(value));

const tags = z
  .array(z.string().trim().toLowerCase().min(1).max(30))
  .max(10)
  .transform((list) => [...new Set(list)]);

/** Comma separated list in the query string, e.g. ?status=open,in_progress */
const csv = (item) =>
  z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    )
    .pipe(z.array(item).min(1).max(20));

const taskParams = idParam('taskId');

const createTask = {
  body: z
    .object({
      title: z.string().trim().min(1).max(200),
      description: z.string().trim().max(10_000).optional(),
      status: status.optional(),
      priority: priority.optional(),
      dueDate: isoDate.nullable().optional(),
      tags: tags.optional(),
      team: objectId.nullable().optional(),
      assignee: objectId.nullable().optional(),
    })
    .strict(),
};

const updateTask = {
  params: taskParams,
  body: z
    .object({
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().trim().max(10_000).optional(),
      status: status.optional(),
      priority: priority.optional(),
      dueDate: isoDate.nullable().optional(),
      tags: tags.optional(),
      assignee: objectId.nullable().optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, 'Provide at least one field to update'),
};

const updateStatus = {
  params: taskParams,
  body: z.object({ status }).strict(),
};

const updateAssignee = {
  params: taskParams,
  // null unassigns the task.
  body: z.object({ assignee: objectId.nullable() }).strict(),
};

const SORT_FIELDS = ['createdAt', 'updatedAt', 'dueDate', 'priority', 'title', 'status'];
const sort = z.enum(['relevance', ...SORT_FIELDS, ...SORT_FIELDS.map((field) => `-${field}`)]);

const listTasks = {
  query: z
    .object({
      ...paginationQuery,
      status: csv(status).optional(),
      priority: csv(priority).optional(),
      tags: csv(z.string().trim().toLowerCase().max(30)).optional(),
      team: objectId.optional(),
      assignee: z.union([z.literal('me'), z.literal('unassigned'), objectId]).optional(),
      createdBy: z.union([z.literal('me'), objectId]).optional(),
      dueBefore: isoDate.optional(),
      dueAfter: isoDate.optional(),
      overdue: queryBoolean.optional(),
      search: z.string().trim().min(1).max(200).optional(),
      sort: sort.optional(),
    })
    .strict()
    .refine((q) => !(q.dueAfter && q.dueBefore) || q.dueAfter <= q.dueBefore, {
      message: 'dueAfter must be before dueBefore',
      path: ['dueAfter'],
    }),
};

const stats = {
  query: z.object({ team: objectId.optional() }).strict(),
};

module.exports = {
  taskParams: { params: taskParams },
  createTask,
  updateTask,
  updateStatus,
  updateAssignee,
  listTasks,
  stats,
};

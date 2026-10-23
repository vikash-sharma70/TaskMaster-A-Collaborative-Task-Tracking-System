'use strict';

const { z } = require('zod');
const { TASK_PRIORITY } = require('../../constants');
const { idParam } = require('../../utils/validators');

const generateDescription = {
  body: z
    .object({
      title: z.string().trim().min(3).max(200),
      notes: z.string().trim().max(4000).optional(),
      priority: z.enum(Object.values(TASK_PRIORITY)).optional(),
    })
    .strict(),
};

const summarizeTask = { params: idParam('taskId') };

module.exports = { generateDescription, summarizeTask };

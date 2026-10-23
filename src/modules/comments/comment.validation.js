'use strict';

const { z } = require('zod');
const { idParam, objectId, paginationQuery } = require('../../utils/validators');

const commentBody = z.object({ body: z.string().trim().min(1).max(5000) }).strict();
const commentParams = z.object({ taskId: objectId, commentId: objectId }).strict();

const listComments = {
  params: idParam('taskId'),
  query: z
    .object({
      ...paginationQuery,
      order: z.enum(['asc', 'desc']).default('desc'),
    })
    .strict(),
};

const addComment = { params: idParam('taskId'), body: commentBody };
const updateComment = { params: commentParams, body: commentBody };
const deleteComment = { params: commentParams };

module.exports = { listComments, addComment, updateComment, deleteComment };

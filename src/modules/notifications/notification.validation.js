'use strict';

const { z } = require('zod');
const { NOTIFICATION_TYPE } = require('../../constants');
const { idParam, paginationQuery, queryBoolean } = require('../../utils/validators');

const list = {
  query: z
    .object({
      ...paginationQuery,
      unread: queryBoolean.optional(),
      type: z.enum(Object.values(NOTIFICATION_TYPE)).optional(),
    })
    .strict(),
};

const byId = { params: idParam('notificationId') };

module.exports = { list, byId };

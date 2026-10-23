'use strict';

const { z } = require('zod');
const { idParam, password, nullableText } = require('../../utils/validators');

const updateProfile = {
  body: z
    .object({
      name: z.string().trim().min(2).max(100).optional(),
      bio: nullableText(500).optional(),
      avatarUrl: z
        .string()
        .trim()
        .url('Must be a valid URL')
        .max(2048)
        .refine((url) => /^https?:\/\//i.test(url), 'Must be an http(s) URL')
        .nullable()
        .optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update'),
};

const changePassword = {
  body: z
    .object({
      currentPassword: z.string().min(1).max(128),
      newPassword: password,
    })
    .strict()
    .refine((b) => b.currentPassword !== b.newPassword, {
      message: 'New password must differ from the current password',
      path: ['newPassword'],
    }),
};

const getUser = { params: idParam('userId') };

module.exports = { updateProfile, changePassword, getUser };

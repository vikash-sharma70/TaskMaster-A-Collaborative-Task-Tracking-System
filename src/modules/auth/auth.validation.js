'use strict';

const { z } = require('zod');
const { email, password } = require('../../utils/validators');

const register = {
  body: z
    .object({
      name: z.string().trim().min(2).max(100),
      email,
      password,
    })
    .strict(),
};

const login = {
  body: z
    .object({
      email,
      // Do not leak the password policy on login; just bound the size.
      password: z.string().min(1, 'Password is required').max(128),
    })
    .strict(),
};

/** Refresh token may arrive in the httpOnly cookie instead of the body. */
const refresh = {
  body: z
    .object({
      refreshToken: z.string().min(1).max(512).optional(),
    })
    .strict(),
};

module.exports = { register, login, refresh };

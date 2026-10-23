'use strict';

const { sendSuccess, sendNoContent } = require('../../utils/response');
const userService = require('./user.service');

async function getMe(req, res) {
  return sendSuccess(res, await userService.getById(req.auth.userId));
}

async function updateMe(req, res) {
  return sendSuccess(res, await userService.updateProfile(req.auth.userId, req.body));
}

async function changePassword(req, res) {
  await userService.changePassword(req.auth.userId, req.body, req.auth.sessionId);
  return sendNoContent(res);
}

async function getUser(req, res) {
  return sendSuccess(res, await userService.getPublicProfile(req.params.userId, req.auth.userId));
}

module.exports = { getMe, updateMe, changePassword, getUser };

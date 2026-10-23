'use strict';

const { sendSuccess } = require('../../utils/response');
const aiService = require('./ai.service');

async function generateDescription(req, res) {
  return sendSuccess(res, await aiService.generateTaskDescription(req.body));
}

async function summarizeTask(req, res) {
  return sendSuccess(res, await aiService.summarizeTask(req.params.taskId, req.auth.userId));
}

module.exports = { generateDescription, summarizeTask };

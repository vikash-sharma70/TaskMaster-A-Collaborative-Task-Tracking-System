'use strict';

const mongoose = require('mongoose');
const multer = require('multer');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

/** Maps well-known library errors onto ApiErrors so clients get precise responses. */
function normalise(err) {
  if (err instanceof ApiError) return err;

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({
      location: 'body',
      field: e.path,
      message: e.message,
    }));
    return ApiError.validation(details);
  }
  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for "${err.path}"`);
  }
  if (err instanceof mongoose.Error.VersionError) {
    return ApiError.conflict(
      'The resource was modified concurrently, please retry',
      'VERSION_CONFLICT',
    );
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern ?? err.keyValue ?? {})[0] ?? 'field';
    return ApiError.conflict(`A record with this ${field} already exists`, 'DUPLICATE_KEY');
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return ApiError.payloadTooLarge(
        `File exceeds the maximum size of ${Math.round(config.uploads.maxFileSizeBytes / 1024 / 1024)} MB`,
      );
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return ApiError.badRequest(
        `Upload up to ${config.uploads.maxFiles} files using the "files" field`,
      );
    }
    return ApiError.badRequest(err.message);
  }
  // body-parser errors (malformed JSON, payload too large) carry a status.
  if (err?.type === 'entity.parse.failed') return ApiError.badRequest('Malformed JSON body');
  if (err?.type === 'entity.too.large') {
    return ApiError.payloadTooLarge('Request body is too large');
  }
  if (err?.status >= 400 && err?.status < 500 && err.expose) {
    return new ApiError(err.status, 'BAD_REQUEST', err.message);
  }
  return null;
}

/**
 * Final error handler. Operational errors are returned verbatim; unexpected
 * errors are logged with full context and reported as an opaque 500 so no
 * internals leak to clients.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
function errorHandler(err, req, res, next) {
  const apiError = normalise(err);
  const log = req.log ?? console;

  if (!apiError) {
    log.error({ err }, 'Unhandled error');
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        requestId: req.id,
        ...(!config.isProduction && { debug: err?.message }),
      },
    });
  }

  if (apiError.statusCode >= 500) log.error({ err }, apiError.message);
  else log.debug({ code: apiError.code }, apiError.message);

  return res.status(apiError.statusCode).json({
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details !== undefined && { details: apiError.details }),
      requestId: req.id,
    },
  });
}

function notFound(req, res, next) {
  next(new ApiError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
}

module.exports = { errorHandler, notFound };

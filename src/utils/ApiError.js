'use strict';

/**
 * Operational error carrying an HTTP status and a stable, machine-readable code.
 * Anything thrown that is NOT an ApiError is treated as an unexpected 500.
 */
class ApiError extends Error {
  /**
   * @param {number} statusCode HTTP status code.
   * @param {string} code       Stable error code clients can branch on.
   * @param {string} message    Human readable message.
   * @param {unknown} [details] Optional structured details (e.g. validation issues).
   */
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'Bad request', details) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static validation(details, message = 'Request validation failed') {
    return new ApiError(422, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new ApiError(401, code, message);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(resource = 'Resource') {
    return new ApiError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(message, code = 'CONFLICT') {
    return new ApiError(409, code, message);
  }

  static gone(message) {
    return new ApiError(410, 'GONE', message);
  }

  static payloadTooLarge(message) {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', message);
  }

  static unsupportedMediaType(message) {
    return new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', message);
  }

  static serviceUnavailable(message, code = 'SERVICE_UNAVAILABLE') {
    return new ApiError(503, code, message);
  }

  static badGateway(message, code = 'UPSTREAM_ERROR') {
    return new ApiError(502, code, message);
  }
}

module.exports = ApiError;

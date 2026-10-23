'use strict';

const ApiError = require('../utils/ApiError');

const SOURCES = ['params', 'query', 'body'];

function formatIssues(issues, source) {
  return issues.map((issue) => ({
    location: source,
    field: issue.path.join('.') || source,
    message: issue.message,
  }));
}

/**
 * Validates and coerces request input against zod schemas.
 *
 * Parsed (typed, defaulted, stripped) values replace the raw input so
 * controllers only ever see trusted data. Express 5 defines `req.query` as a
 * getter, so it is redefined as a plain value property.
 *
 * @param {{params?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, body?: import('zod').ZodTypeAny}} schemas
 */
function validate(schemas) {
  return (req, res, next) => {
    const errors = [];
    for (const source of SOURCES) {
      const schema = schemas[source];
      if (!schema) continue;
      const result = schema.safeParse(req[source] ?? {});
      if (!result.success) {
        errors.push(...formatIssues(result.error.issues, source));
        continue;
      }
      if (source === 'query') {
        Object.defineProperty(req, 'query', {
          value: result.data,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      } else {
        req[source] = result.data;
      }
    }
    if (errors.length) return next(ApiError.validation(errors));
    return next();
  };
}

module.exports = validate;

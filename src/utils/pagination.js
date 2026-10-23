'use strict';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Converts validated page/limit query values into skip/limit for MongoDB.
 */
function toPagination({ page = 1, limit = DEFAULT_LIMIT } = {}) {
  const safeLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
  const safePage = Math.max(page, 1);
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}

function buildPageMeta({ page, limit }, total) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
  };
}

/**
 * Runs the page query and the count in parallel.
 * @param {import('mongoose').Model} Model
 * @param {object} filter
 * @param {{page:number,limit:number}} paging
 * @param {(q: import('mongoose').Query) => import('mongoose').Query} [decorate] adds sort/populate/projection
 */
async function paginate(Model, filter, paging, decorate = (q) => q) {
  const { page, limit, skip } = toPagination(paging);
  const [items, total] = await Promise.all([
    decorate(Model.find(filter)).skip(skip).limit(limit).lean({ virtuals: false }),
    Model.countDocuments(filter),
  ]);
  return { items, meta: buildPageMeta({ page, limit }, total) };
}

module.exports = { DEFAULT_LIMIT, MAX_LIMIT, toPagination, buildPageMeta, paginate };

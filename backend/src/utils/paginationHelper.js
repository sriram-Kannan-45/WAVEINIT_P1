/**
 * paginationHelper.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Safe, standardized server-side pagination helper for the LMS backend.
 *
 * Features:
 * - Sanitizes `page` and `limit` query parameters with strict bounds.
 * - Prevents negative values, page 0, strings, NaN, and excessive limits (> 100).
 * - Computes database `offset` and `limit` options for Sequelize / SQL queries.
 * - Formats standard pagination metadata and responses with 100% backward compatibility.
 */

/**
 * Parses and sanitizes pagination parameters from request query.
 *
 * @param {Object} query - req.query object containing page, limit, or offset
 * @param {number} [defaultLimit=10] - Default limit if not specified or invalid
 * @param {number} [maxLimit=100] - Maximum allowable limit to prevent resource exhaustion
 * @returns {{ page: number, limit: number, offset: number }}
 */
function parsePagination(query = {}, defaultLimit = 10, maxLimit = 100) {
  let parsedPage = 1;
  let parsedLimit = defaultLimit;

  // Validate & parse limit
  if (query.limit !== undefined && query.limit !== null && query.limit !== '') {
    const lim = parseInt(query.limit, 10);
    if (!isNaN(lim) && lim > 0) {
      parsedLimit = Math.min(Math.max(1, lim), maxLimit);
    }
  }

  // Validate & parse page or offset
  if (query.page !== undefined && query.page !== null && query.page !== '') {
    const pg = parseInt(query.page, 10);
    if (!isNaN(pg) && pg > 0) {
      parsedPage = Math.max(1, pg);
    }
  } else if (query.offset !== undefined && query.offset !== null && query.offset !== '') {
    const off = parseInt(query.offset, 10);
    if (!isNaN(off) && off >= 0) {
      parsedPage = Math.floor(off / parsedLimit) + 1;
    }
  }

  const offset = (parsedPage - 1) * parsedLimit;

  return {
    page: parsedPage,
    limit: parsedLimit,
    offset,
  };
}

/**
 * Generates standardized pagination metadata object.
 *
 * @param {number} totalItems - Total count of matching records
 * @param {number} page - Current active page number (1-indexed)
 * @param {number} limit - Number of records per page
 * @returns {{ page: number, limit: number, totalItems: number, totalPages: number, hasNextPage: boolean, hasPreviousPage: boolean }}
 */
function formatPaginationMeta(totalItems = 0, page = 1, limit = 10) {
  const safeTotal = Math.max(0, parseInt(totalItems, 10) || 0);
  const safeLimit = Math.max(1, parseInt(limit, 10) || 10);
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const totalPages = Math.max(1, Math.ceil(safeTotal / safeLimit));

  return {
    page: safePage,
    limit: safeLimit,
    totalItems: safeTotal,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPreviousPage: safePage > 1,
  };
}

/**
 * Formats a standardized JSON response envelope with pagination metadata
 * while maintaining top-level backward compatibility for existing consumers.
 *
 * @param {Array} data - Array of records for the current page
 * @param {number} totalItems - Total matching records count
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {Object} [extra={}] - Additional top-level fields (e.g., custom resource keys, summary stats)
 * @returns {Object} Standardized response object
 */
function formatPaginatedResponse(data = [], totalItems = 0, page = 1, limit = 10, extra = {}) {
  const pagination = formatPaginationMeta(totalItems, page, limit);

  return {
    success: true,
    data,
    pagination,
    // Top-level backwards compatibility fields
    total: pagination.totalItems,
    page: pagination.page,
    limit: pagination.limit,
    totalPages: pagination.totalPages,
    ...extra,
  };
}

module.exports = {
  parsePagination,
  formatPaginationMeta,
  formatPaginatedResponse,
};

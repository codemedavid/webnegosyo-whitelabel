/**
 * Pure pagination math for the web-admin Customers list.
 *
 * Kept separate from the Supabase read (`getCustomersPage` in customers-service)
 * so the offset/range/clamp logic can be unit-tested in isolation while the
 * count query stays thin, untestable glue. The page passes a raw `?page` value
 * (which may be NaN, 0, negative, or past the end); this normalizes all of them
 * into a safe, displayable window.
 */

export interface CustomersPagination {
  /** 1-based page actually being shown, after clamping the request. */
  currentPage: number
  /** Total number of pages; 0 when there are no customers. */
  totalPages: number
  /** Zero-based row offset for the Supabase `.range()` call. */
  offset: number
  /** Page size echoed back for the `.range()` call. */
  limit: number
  hasPreviousPage: boolean
  hasNextPage: boolean
  /** 1-based index of the first row on this page (0 when empty). */
  rangeStart: number
  /** 1-based index of the last row on this page (0 when empty). */
  rangeEnd: number
  totalCount: number
}

/**
 * Resolve the safe window to fetch and display for a requested page.
 *
 * @param totalCount   total matching customers (from a Supabase exact count)
 * @param requestedPage 1-based page from the URL; NaN / <1 / past-end are clamped
 * @param pageSize     rows per page (must be >= 1)
 */
export function computeCustomersPagination(
  totalCount: number,
  requestedPage: number,
  pageSize: number
): CustomersPagination {
  const safeTotal = Math.max(0, Math.floor(totalCount) || 0)
  const totalPages = Math.ceil(safeTotal / pageSize)

  // NaN/Infinity → 1; then clamp into [1, totalPages] (never below 1).
  const requested = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1
  const currentPage = Math.min(Math.max(requested, 1), Math.max(totalPages, 1))

  const offset = (currentPage - 1) * pageSize
  const rangeStart = safeTotal === 0 ? 0 : offset + 1
  const rangeEnd = Math.min(offset + pageSize, safeTotal)

  return {
    currentPage,
    totalPages,
    offset,
    limit: pageSize,
    hasPreviousPage: currentPage > 1,
    hasNextPage: currentPage < totalPages,
    rangeStart,
    rangeEnd,
    totalCount: safeTotal,
  }
}

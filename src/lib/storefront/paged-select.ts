/**
 * Read a whole PostgREST result set, past the server's `max-rows` cap.
 *
 * PostgREST silently truncates every response at 1000 rows. A query with no
 * `.range()` therefore "works" for every small store and quietly drops rows
 * for a big one — a 4066-item mini-mart showed 1000 dishes and nothing told
 * anyone the other 3066 existed.
 *
 * The first page asks for an exact count; the remaining pages are then fetched
 * in parallel. When the count is unavailable the pages are walked one by one
 * until a short page. Either way the read is bounded by `maxRows`.
 *
 * The caller's query MUST have a total, deterministic order (e.g. `order`
 * then `id`): ranges over a non-unique sort key can skip or repeat rows.
 */

/** PostgREST's default `max-rows`; a page larger than this comes back short. */
export const POSTGREST_PAGE_SIZE = 1000

/** Upper bound on rows read for one result set — a runaway table must not hang a page. */
export const MAX_PAGED_ROWS = 10_000

export interface PageRequest {
  /** Inclusive start offset. */
  from: number
  /** Inclusive end offset, as `.range(from, to)` takes it. */
  to: number
  /** Only the first request asks PostgREST to count the full result set. */
  withCount: boolean
}

export interface PageResponse<T> {
  data: T[] | null
  error: { message: string } | null
  count?: number | null
}

export type PageQuery<T> = (request: PageRequest) => PromiseLike<PageResponse<T>>

export interface PagedSelectOptions {
  pageSize?: number
  maxRows?: number
  /** Names the read in the truncation warning. */
  label?: string
}

export interface PagedSelectResult<T> {
  data: T[]
  error: { message: string } | null
  /** True when the table held more rows than `maxRows` and the rest were not read. */
  isTruncated: boolean
}

function pageRequest(from: number, pageSize: number, maxRows: number, withCount: boolean): PageRequest {
  return { from, to: Math.min(from + pageSize, maxRows) - 1, withCount }
}

/** Keep the first occurrence of each id: a row inserted mid-read shifts later pages by one. */
function dedupeById<T extends { id: string }>(rows: readonly T[]): T[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    if (seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
}

async function readRemainingInParallel<T>(
  query: PageQuery<T>,
  total: number,
  pageSize: number,
  maxRows: number
): Promise<PageResponse<T>[]> {
  const end = Math.min(total, maxRows)
  const requests: PageRequest[] = []
  for (let from = pageSize; from < end; from += pageSize) {
    requests.push(pageRequest(from, pageSize, maxRows, false))
  }
  return Promise.all(requests.map((request) => query(request)))
}

async function readRemainingSequentially<T>(
  query: PageQuery<T>,
  pageSize: number,
  maxRows: number
): Promise<PageResponse<T>[]> {
  const pages: PageResponse<T>[] = []
  for (let from = pageSize; from < maxRows; from += pageSize) {
    const page = await query(pageRequest(from, pageSize, maxRows, false))
    pages.push(page)
    if (page.error || (page.data ?? []).length < pageSize) break
  }
  return pages
}

export async function selectAllPages<T extends { id: string }>(
  query: PageQuery<T>,
  options: PagedSelectOptions = {}
): Promise<PagedSelectResult<T>> {
  const pageSize = options.pageSize ?? POSTGREST_PAGE_SIZE
  const maxRows = options.maxRows ?? MAX_PAGED_ROWS

  const first = await query(pageRequest(0, pageSize, maxRows, true))
  if (first.error) return { data: [], error: first.error, isTruncated: false }

  const firstRows = first.data ?? []
  const total = typeof first.count === 'number' ? first.count : null
  if (firstRows.length < pageSize && (total === null || total <= firstRows.length)) {
    return { data: firstRows, error: null, isTruncated: false }
  }

  const rest = total === null
    ? await readRemainingSequentially(query, pageSize, maxRows)
    : await readRemainingInParallel(query, total, pageSize, maxRows)

  const failed = rest.find((page) => page.error)
  // A partial table is worse than a failed one: the caller would render (and
  // cache) a menu with a silent hole in it.
  if (failed?.error) return { data: [], error: failed.error, isTruncated: false }

  const rows = dedupeById([...firstRows, ...rest.flatMap((page) => page.data ?? [])])
  const lastPage = rest[rest.length - 1]
  const isTruncated = total === null
    ? rows.length >= maxRows && (lastPage?.data ?? []).length === pageSize
    : total > maxRows

  if (isTruncated) {
    console.warn(
      `[paged-select] ${options.label ?? 'query'} has more than ${maxRows} rows; only the first ${maxRows} were read`
    )
  }

  return { data: rows, error: null, isTruncated }
}

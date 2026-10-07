/**
 * Reads past the API's 1000-row cap. A single `.limit(5000)` silently returns
 * at most 1000 rows, so a "capped at 5000" check never fires and the counts
 * read low with no caveat. Every page must be ordered by a unique column.
 */

/** PostgREST's max rows per request on the platform project. */
export const API_PAGE_SIZE = 1000

export interface PageResult<T> {
  data: T[] | null
  error: { message: string } | null
}

export interface PagedRows<T> {
  rows: T[]
  /** True when `maxRows` was reached, so totals are a floor. */
  isCapped: boolean
}

export async function readPaged<T>(
  readPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  maxRows: number,
  pageSize = API_PAGE_SIZE,
): Promise<PagedRows<T>> {
  let rows: T[] = []
  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize, maxRows) - 1
    const { data, error } = await readPage(from, to)
    if (error) throw new Error(error.message)
    const page = data ?? []
    rows = [...rows, ...page]
    if (page.length < to - from + 1) return { rows, isCapped: false }
  }
  return { rows, isCapped: rows.length >= maxRows }
}

/** `ids` in groups small enough for one `in.(…)` filter in a request URL. */
export function chunk<T>(ids: readonly T[], size: number): T[][] {
  const groups: T[][] = []
  for (let index = 0; index < ids.length; index += size) groups.push(ids.slice(index, index + size))
  return groups
}

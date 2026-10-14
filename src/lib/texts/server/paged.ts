/**
 * Reading past PostgREST's 1000-row cap, bounded. Server-side helpers shared
 * by the automations snapshot and the Texts campaign engine.
 *
 * Every caller must order by a unique key (usually `id`), or pages overlap.
 */

export const PAGE_SIZE = 1000
/** A store larger than this is read in part, loudly, rather than timing out a shared request. */
export const DEFAULT_MAX_ROWS = 50_000

export class PagedReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PagedReadError'
  }
}

export type PageResult = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>

export interface ReadAllOptions {
  maxRows?: number
  /** The error type the caller's callers expect (e.g. SnapshotError). */
  makeError?: (message: string) => Error
}

export async function readAll<T>(
  label: string, page: (from: number, to: number) => PageResult, options: ReadAllOptions = {},
): Promise<T[]> {
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS
  const makeError = options.makeError ?? ((message: string) => new PagedReadError(message))
  const rows: T[] = []
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw makeError(`${label} could not be read: ${error.message}`)
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE_SIZE) return rows
  }
  // Exactly maxRows so far: only a row beyond the cap makes it "too many".
  const { data, error } = await page(maxRows, maxRows)
  if (error) throw makeError(`${label} could not be read: ${error.message}`)
  if (!data || data.length === 0) return rows
  throw makeError(`${label}: more than ${maxRows} rows`)
}

/** Ids per `in.(…)` filter: hundreds of uuids in one URL outgrow the gateway's limit. */
export const IDS_PER_REQUEST = 100

export function chunk<T>(items: readonly T[], size: number = IDS_PER_REQUEST): T[][] {
  const groups: T[][] = []
  for (let start = 0; start < items.length; start += size) groups.push(items.slice(start, start + size))
  return groups
}

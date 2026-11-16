/**
 * Reading past PostgREST's 1000-row cap, bounded. Server-side helpers shared
 * by the automations snapshot and the Texts campaign engine.
 *
 * Every caller must order by a unique key (usually `id`), or pages overlap.
 * The paging itself is `readAllRows` (src/platform/db/read-all-rows.ts); this keeps the
 * throwing interface these callers were written against.
 */

import { MAX_PAGE_SIZE, readAllRows } from '@/platform/db/read-all-rows'

export const PAGE_SIZE = MAX_PAGE_SIZE
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
  // readAllRows turns a thrown page into an error result; this reader has always let it through as-is.
  let thrown: { error: unknown } | null = null
  const result = await readAllRows<T>(async (from, to) => {
    try {
      return (await page(from, to)) as { data: T[] | null; error: { message: string } | null }
    } catch (error) {
      thrown = { error }
      throw error
    }
  }, { maxRows, pageSize: PAGE_SIZE })
  if (result.ok) return result.rows
  if (thrown) throw (thrown as { error: unknown }).error
  if (result.reason === 'error') throw makeError(`${label} could not be read: ${result.error.message}`)
  throw makeError(`${label}: more than ${maxRows} rows`)
}

/** Ids per `in.(…)` filter: hundreds of uuids in one URL outgrow the gateway's limit. */
export const IDS_PER_REQUEST = 100

export function chunk<T>(items: readonly T[], size: number = IDS_PER_REQUEST): T[][] {
  const groups: T[][] = []
  for (let start = 0; start < items.length; start += size) groups.push(items.slice(start, start + size))
  return groups
}

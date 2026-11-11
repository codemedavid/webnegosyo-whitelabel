/**
 * Read a whole result set, past PostgREST's row cap, with a bound.
 *
 * One response from the platform database never carries more than 1,000 rows,
 * whatever range or limit was asked for, and it says nothing about the rest.
 * A reader that does not page therefore works for every small store and
 * silently drops rows for a big one. Around thirty readers page by hand, each
 * with its own loop, its own idea of when to stop and its own answer to "what
 * if there are too many" (several simply stop).
 *
 *   const result = await readAllRows(
 *     (from, to) =>
 *       supabase
 *         .from('orders')
 *         .select('id, total')
 *         .eq('tenant_id', tenantId)
 *         .order('created_at', { ascending: false })
 *         .order('id', { ascending: false })   // unique tiebreak, see below
 *         .range(from, to),
 *     { maxRows: 20_000 },
 *   )
 *   if (!result.ok) { … result.reason is 'error' or 'too-many-rows' … }
 *   use(result.rows)
 *
 * The caller keeps its own typed query; this only owns the paging.
 *
 * STABLE ORDER IS THE CALLER'S JOB. The query must sort by something unique
 * (end the `order` chain with the primary key). Pages are offsets into the
 * sorted set: with a non-unique sort key Postgres may order tied rows
 * differently per request, so a row can appear on two pages or on none.
 * A row inserted while the pages are read can still shift later pages by one;
 * a reader that cannot tolerate that needs a keyset (`id > last`) instead.
 *
 * NEVER SILENTLY SHORT. `maxRows` is required: every store shares one
 * database, so "read everything" needs a ceiling someone chose. A set larger
 * than the ceiling comes back as `ok: false, reason: 'too-many-rows'`; an
 * error on any page as `ok: false, reason: 'error'` with no partial rows (a
 * table with a hole in it is worse than no table).
 *
 * Not adopted anywhere yet. `texts/server/paged.ts#readAll` (throws) and
 * `storefront/paged-select.ts#selectAllPages` (counts first, reads in
 * parallel, de-duplicates by id) are the two shared pagers that exist today;
 * both can become thin adapters over this.
 */

/** PostgREST's `max-rows` on the platform project. A larger page comes back short without saying so. */
export const MAX_PAGE_SIZE = 1000

export interface PageError {
  message: string
  code?: string
  details?: string | null
  hint?: string | null
}

/** The part of a Supabase response this needs. */
export interface PageResponse<Row> {
  data: Row[] | null
  error: PageError | null
}

/** Build the query for the inclusive window `from..to`, i.e. end it with `.range(from, to)`. */
export type PageQuery<Row> = (from: number, to: number) => PromiseLike<PageResponse<Row>>

export interface ReadAllRowsOptions {
  /** The most rows this read may return. One more than this is `too-many-rows`. */
  maxRows: number
  /** Rows per request, 1 to 1,000. Defaults to 1,000. */
  pageSize?: number
}

export type ReadAllRowsResult<Row> =
  | { ok: true; rows: Row[] }
  | { ok: false; reason: 'error'; error: PageError }
  /** `rows` holds the first `maxRows`, for a caller that chooses to show a partial list and say so. */
  | { ok: false; reason: 'too-many-rows'; rows: Row[]; maxRows: number }

function assertWholeNumber(name: string, value: number, max: number): void {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new RangeError(`readAllRows: ${name} must be a whole number from 1 to ${max}, got ${value}`)
  }
}

async function readPage<Row>(query: PageQuery<Row>, from: number, to: number): Promise<PageResponse<Row>> {
  try {
    return await query(from, to)
  } catch (error) {
    // supabase-js answers with `{ error }`; anything thrown is still an error to the caller, not a crash.
    return { data: null, error: { message: error instanceof Error ? error.message : String(error) } }
  }
}

export async function readAllRows<Row>(
  query: PageQuery<Row>,
  { maxRows, pageSize = MAX_PAGE_SIZE }: ReadAllRowsOptions,
): Promise<ReadAllRowsResult<Row>> {
  assertWholeNumber('maxRows', maxRows, Number.MAX_SAFE_INTEGER)
  // A page above the server's cap would come back "short" while more rows exist,
  // and a short page is how this loop knows it has reached the end.
  assertWholeNumber('pageSize', pageSize, MAX_PAGE_SIZE)

  const rows: Row[] = []
  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize, maxRows) - 1
    const { data, error } = await readPage(query, from, to)
    if (error) return { ok: false, reason: 'error', error }
    const page = data ?? []
    rows.push(...page)
    if (page.length < to - from + 1) return { ok: true, rows }
  }

  // Exactly maxRows so far. Only a row beyond the ceiling makes it too many.
  const beyond = await readPage(query, maxRows, maxRows)
  if (beyond.error) return { ok: false, reason: 'error', error: beyond.error }
  if ((beyond.data ?? []).length === 0) return { ok: true, rows }
  return { ok: false, reason: 'too-many-rows', rows, maxRows }
}

/**
 * Did the write actually change a row?
 *
 * Row-level security refuses an UPDATE or DELETE silently: the statement
 * succeeds, matches zero rows and returns no error. So does a filter that
 * matched nothing (a stale id, a lost compare-and-swap). A writer that checks
 * only `error` reports "saved" for a write the database turned away.
 *
 * Ask the database what it changed, then pass the response through here:
 *
 *   // 1. rows back (works for insert / update / upsert / delete)
 *   const result = assertRowsChanged(
 *     await supabase.from('tenants').update({ pos_stock_policy }).eq('id', tenantId).select('id'),
 *     { expected: 1 },
 *   )
 *   if (!result.ok) return { success: false, error: 'This setting could not be saved.' }
 *
 *   // 2. a count, when the rows themselves are not needed
 *   const result = assertRowsChanged(
 *     await supabase.from('stock_alerts').delete({ count: 'exact' }).eq('tenant_id', tenantId).lt('created_at', cutoff),
 *   )
 *
 * A write that asked for neither rows nor a count cannot be judged, and is
 * reported as a failure (`not-counted`) rather than waved through: add
 * `.select(…)` or `{ count: 'exact' }`.
 *
 * Returns a result instead of throwing, so the caller words the failure for
 * the person who made the change. `result.reason` says which kind it was.
 *
 * Not adopted anywhere yet.
 */

export interface WriteError {
  message: string
  code?: string
  details?: string | null
  hint?: string | null
}

/** The part of a Supabase write response this needs. */
export interface WriteResponse<Row> {
  /** Rows from `.select()`, one row from `.single()` / `.maybeSingle()`, or null. */
  data?: Row[] | Row | null
  error: WriteError | null
  /** Set when the write passed `{ count: 'exact' }`. */
  count?: number | null
  /** HTTP status; 204 means the write did not ask for its rows back. */
  status?: number
}

export interface AssertRowsChangedOptions {
  /** The exact number of rows the write must change. Left out: at least one. */
  expected?: number
}

export type RowsChangedResult<Row> =
  /** `rows` is empty when the write was counted rather than selected. */
  | { ok: true; count: number; rows: Row[] }
  | { ok: false; reason: 'error'; error: WriteError }
  /** Zero rows: row-level security refused the write, or its filter matched nothing. */
  | { ok: false; reason: 'no-rows-changed' }
  /** Some rows changed, but not the number the caller expected. */
  | { ok: false; reason: 'unexpected-count'; count: number; expected: number }
  /** The write asked for neither rows nor a count, so nothing can be said about it. */
  | { ok: false; reason: 'not-counted' }

const NO_CONTENT = 204

function changedRows<Row>(response: WriteResponse<Row>): { count: number; rows: Row[] } | null {
  const { data, count } = response
  if (Array.isArray(data)) return { count: data.length, rows: data }
  if (data !== null && data !== undefined) return { count: 1, rows: [data] }
  if (typeof count === 'number') return { count, rows: [] }
  // `.select().maybeSingle()` with no row: the rows were asked for and there were none.
  if (response.status !== undefined && response.status !== NO_CONTENT) return { count: 0, rows: [] }
  return null
}

export function assertRowsChanged<Row>(
  response: WriteResponse<Row>,
  { expected }: AssertRowsChangedOptions = {},
): RowsChangedResult<Row> {
  if (response.error) return { ok: false, reason: 'error', error: response.error }

  const changed = changedRows(response)
  if (changed === null) return { ok: false, reason: 'not-counted' }
  if (changed.count === 0) return { ok: false, reason: 'no-rows-changed' }
  if (expected !== undefined && changed.count !== expected) {
    return { ok: false, reason: 'unexpected-count', count: changed.count, expected }
  }
  return { ok: true, ...changed }
}

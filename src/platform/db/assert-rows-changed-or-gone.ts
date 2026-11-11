/**
 * Zero rows changed: refused, or nothing left to change?
 *
 * `assertRowsChanged` calls every zero-row write a failure. For some writes
 * that is wrong: deleting a row that is already gone (the second tap of a
 * double tap, a list that was stale) changes nothing and is exactly what the
 * person wanted. Row-level security refusing the delete also changes nothing
 * and reports no error. The response alone cannot tell the two apart; the
 * table can. After a zero-row write, look for the rows it was aimed at:
 *
 *   const result = await assertRowsChangedOrGone(
 *     await supabase.from('categories').delete().eq('id', id).eq('tenant_id', tenantId).select('id'),
 *     () => supabase.from('categories').select('id').eq('id', id).eq('tenant_id', tenantId).limit(1),
 *   )
 *   if (!result.ok) throw writeFailure(result)
 *
 * Still there: the write was turned away (`refused`). Gone: success with a
 * count of zero. The look happens only after a zero-row write, with the same
 * client, so it sees what the person who made the change may see. A row the
 * caller cannot see at all counts as gone: this only ever reports a refusal
 * it has seen proof of.
 *
 * The write must ask for its rows (`.select(…)`) or a count
 * (`{ count: 'exact' }`), as for `assertRowsChanged`.
 */

import { assertRowsChanged, type WriteError, type WriteResponse } from './assert-rows-changed'

/** The part of a Supabase read response this needs. */
export interface RemainingResponse {
  data: unknown[] | null
  error: WriteError | null
}

/** Read the rows the write was aimed at; one row is enough (`.limit(1)`). */
export type RemainingQuery = () => PromiseLike<RemainingResponse>

export type RowsChangedOrGoneResult<Row> =
  /** `count` is zero when there was nothing left to change. */
  | { ok: true; count: number; rows: Row[] }
  | { ok: false; reason: 'error'; error: WriteError }
  /** Zero rows changed and the rows the write was aimed at are still there. */
  | { ok: false; reason: 'refused' }
  /** The write asked for neither rows nor a count, so nothing can be said about it. */
  | { ok: false; reason: 'not-counted' }

export async function assertRowsChangedOrGone<Row>(
  response: WriteResponse<Row>,
  remaining: RemainingQuery,
): Promise<RowsChangedOrGoneResult<Row>> {
  const changed = assertRowsChanged(response)
  if (changed.ok || changed.reason === 'error' || changed.reason === 'not-counted') return changed

  const { data, error } = await remaining()
  if (error) return { ok: false, reason: 'error', error }
  return (data ?? []).length > 0 ? { ok: false, reason: 'refused' } : { ok: true, count: 0, rows: [] }
}

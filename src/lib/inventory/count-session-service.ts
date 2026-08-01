/**
 * Recording that a stock count happened.
 *
 * `count-session.ts` decides what a finished count is worth; this writes one
 * down. The division is the same one transfers make: every rule about what a
 * count MEANS stays testable without a database, and this file is reads, one
 * insert, and one status change.
 *
 * **The stock itself still moves only through `stock_movements`.** A session
 * records the ACT of counting; the ledger records its effect, so
 * `apply_stock_movement()` remains the single writer of every on-hand figure.
 * Nothing here touches a quantity.
 */

import { createClient } from '@/lib/supabase/server'
import { resolveActingBranchScope } from '@/lib/inventory/acting-branch-scope'
import { resolveMovementBranch } from '@/lib/inventory/branch-stock-view'
import { toBusinessDayKey } from '@/lib/inventory/business-day'
import {
  judgeCountSession,
  type CountSessionProgress,
} from '@/lib/inventory/count-session'

/** A session as the rest of the app reads it. */
export interface CountSessionRecord {
  id: string
  outletId: string | null
  businessDay: string
  /** Ingredients in scope WHEN THIS OPENED. Never recomputed — see `openCount`. */
  expectedItemCount: number
  closedAt: string | null
}

export interface OpenCountInput {
  /** The shelf being counted. Absent means the author's own scope decides. */
  outletId?: string | null
  note?: string
}

interface CountRow {
  id: string
  tenant_id: string
  outlet_id: string | null
  business_day: string
  status: 'open' | 'closed'
  expected_item_count: number
  closed_at: string | null
}

type CountClient = Awaited<ReturnType<typeof createClient>>

function toRecord(row: CountRow): CountSessionRecord {
  return {
    id: row.id,
    outletId: row.outlet_id,
    businessDay: row.business_day,
    expectedItemCount: Number(row.expected_item_count),
    closedAt: row.closed_at,
  }
}

/**
 * Who is doing this, or nobody.
 *
 * Never throws. An unattributed count is a much smaller problem than a count
 * that could not be opened because an identity lookup failed.
 */
async function actingUserId(supabase: CountClient): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser()
    return data?.user?.id ?? null
  } catch {
    return null
  }
}

/** The count already running on this shelf, if there is one. */
async function findOpenCount(
  supabase: CountClient,
  tenantId: string,
  outletId: string | null,
): Promise<CountSessionRecord | null> {
  const query = supabase
    .from('inventory_counts')
    .select('id, tenant_id, outlet_id, business_day, status, expected_item_count, closed_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'open')

  // `is null` and `= null` are not the same question in SQL, and the store pool
  // is a real shelf rather than an absent one.
  const scoped = outletId === null ? query.is('outlet_id', null) : query.eq('outlet_id', outletId)

  const { data, error } = await scoped.maybeSingle()
  if (error) throw error
  return data ? toRecord(data as unknown as CountRow) : null
}

/**
 * How many ingredients are countable right now.
 *
 * Only active ones: an ingredient nobody stocks any more can never be counted,
 * so including it would make every complete count read as permanently partial —
 * and a caveat that appears on every good day stops being read.
 */
async function countIngredientsInScope(
  supabase: CountClient,
  tenantId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
  if (error) throw error
  return (data ?? []).length
}

/**
 * Start counting, or join the count already under way.
 *
 * Joining rather than refusing is deliberate. Two people tapping "start count"
 * within a minute of each other are counting one shelf, and two open sessions
 * would each report partial coverage of a shelf that was actually counted twice
 * over. The partial unique index enforces the same thing at the database; this
 * makes the common case pleasant instead of an error.
 *
 * `expected_item_count` is captured HERE and never again. A denominator read
 * live at report time would quietly demote a finished count to a partial one
 * the day somebody adds an ingredient.
 */
export async function openCount(
  tenantId: string,
  input: OpenCountInput,
): Promise<CountSessionRecord> {
  const supabase = await createClient()

  // Throws for a manager naming somebody else's shelf, before anything is read
  // or written — a refused count must leave no trace.
  const outletId = resolveMovementBranch(
    input.outletId,
    await resolveActingBranchScope(supabase, tenantId),
  )

  const existing = await findOpenCount(supabase, tenantId, outletId)
  if (existing) return existing

  const { data, error } = await supabase
    .from('inventory_counts')
    .insert({
      tenant_id: tenantId,
      outlet_id: outletId,
      business_day: toBusinessDayKey(new Date().toISOString()),
      status: 'open',
      expected_item_count: await countIngredientsInScope(supabase, tenantId),
      note: input.note ?? null,
      started_by: await actingUserId(supabase),
    } as never)
    .select('id, tenant_id, outlet_id, business_day, status, expected_item_count, closed_at')
    .single()
  if (error) throw error

  return toRecord(data as unknown as CountRow)
}

/** The session by id, or null when it is not this store's. */
async function loadCount(
  supabase: CountClient,
  tenantId: string,
  countId: string,
): Promise<CountRow | null> {
  const { data, error } = await supabase
    .from('inventory_counts')
    .select('id, tenant_id, outlet_id, business_day, status, expected_item_count, closed_at')
    .eq('tenant_id', tenantId)
    .eq('id', countId)
    .single()
  if (error) throw error
  return (data as unknown as CountRow) ?? null
}

/**
 * Declare the count over.
 *
 * Both facts are written together because the schema rejects one without the
 * other, and because a row saying `closed` with no timestamp reads as finished
 * to one query and as running to another — at which point the report disagrees
 * with itself about whether the shelf was accounted for.
 */
export async function closeCount(tenantId: string, countId: string): Promise<void> {
  const supabase = await createClient()
  const count = await loadCount(supabase, tenantId, countId)
  if (!count) throw new Error('That stock count could not be found')

  // Re-closing would move `closed_at` forward, and that timestamp is the
  // evidence for when this shelf was last accounted for.
  if (count.status === 'closed') throw new Error('That stock count is already closed')

  const { error } = await supabase
    .from('inventory_counts')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: await actingUserId(supabase),
    } as never)
    .eq('tenant_id', tenantId)
    .eq('id', countId)
  if (error) throw error
}

/** The count running on a shelf right now, if any. */
export async function getOpenCount(
  tenantId: string,
  outletId: string | null,
): Promise<CountSessionRecord | null> {
  const supabase = await createClient()
  return findOpenCount(supabase, tenantId, outletId)
}

/** Every ingredient counted under a session, duplicates included. */
async function loadCountedItemIds(
  supabase: CountClient,
  tenantId: string,
  countId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('stock_movements')
    .select('inventory_item_id')
    .eq('tenant_id', tenantId)
    .eq('inventory_count_id', countId)
  if (error) throw error
  return ((data ?? []) as unknown as Array<{ inventory_item_id: string }>).map(
    (row) => row.inventory_item_id,
  )
}

/**
 * How far a count got — the judgement in `count-session.ts`, over what was
 * actually filed under it.
 */
export async function getCountProgress(
  tenantId: string,
  countId: string,
): Promise<CountSessionProgress | null> {
  const supabase = await createClient()
  const count = await loadCount(supabase, tenantId, countId)
  if (!count) return null

  return judgeCountSession({
    expectedItemCount: Number(count.expected_item_count),
    countedItemIds: await loadCountedItemIds(supabase, tenantId, countId),
    closedAt: count.closed_at,
  })
}

/**
 * Reads one Manila day of the ledger and reconciles it into the daily report.
 *
 * Uses the RLS server client, NOT the service role. The write side of inventory
 * needs service role because depletion runs behind a customer order with no
 * admin session; the read side has an admin in front of it and must not bypass
 * RLS. Same split `stock-alerts-read.ts` already makes.
 *
 * All arithmetic lives in the pure `daily-report.ts`, so this module is only
 * fetching and shaping — the rules stay testable without a database and stay
 * reusable by the merchant app.
 */

import { createClient } from '@/lib/supabase/server'
import {
  buildDailyInventoryReport,
  type DailyInventoryReport,
  type DailyReportIngredient,
  type DailyReportMovement,
} from '@/lib/inventory/daily-report'
import { resolveBusinessDayWindow } from '@/lib/inventory/business-day'
import type { StockMovementReason } from '@/lib/inventory/stock-ledger'
// Single line on purpose: the app's parity guard strips whole `import` lines,
// so a wrapped import would read as drift between two identical files.
import { judgeCountSession, type CountSessionProgress } from '@/lib/inventory/count-session'
import { readPagesConcurrently } from '@/lib/dashboard/paged-read'

/** PostgREST's row cap: every read past it is paged. */
const PAGE_SIZE = 1000
/** Bounds one request's memory. A day (or a catalogue) this large is refused, never shown short. */
const MAX_ROWS = 100_000
const PAGE_CONCURRENCY = 4

type RowPage = (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>

/**
 * Every row, or an error: a partial ledger must never reconcile as a whole day.
 * Rows are cast to the shape the caller selected (the generated row types are
 * wider than these hand-written projections, e.g. `reason` as plain text).
 */
async function readAll<T>(what: string, page: RowPage): Promise<T[]> {
  const typedPage = async (from: number, to: number) => {
    const { data, error } = await page(from, to)
    return { data: (data ?? null) as T[] | null, error }
  }
  const result = await readPagesConcurrently(typedPage, { pageSize: PAGE_SIZE, maxRows: MAX_ROWS, concurrency: PAGE_CONCURRENCY })
  if (result.error) throw new Error(`Failed to read ${what}: ${result.error}`)
  if (result.truncated) throw new Error(`More than ${MAX_ROWS} ${what} in one report; refusing to show a partial day`)
  return result.rows
}

export interface DailyInventoryReportForDay extends DailyInventoryReport {
  /** The Manila day this covers, `YYYY-MM-DD`. */
  dayKey: string
  /**
   * How far the day's stock count got, or `null` when nobody opened one.
   *
   * `null` means "no count session", NOT "an abandoned count" — every day
   * before sessions existed looks like this, as does every tenant who counts
   * without opening one.
   */
  countSession: CountSessionProgress | null
}

interface MovementRow {
  inventory_item_id: string
  reason: StockMovementReason
  quantity_delta: number
  balance_after: number
  created_at: string
  inventory_count_id: string | null
  outlet_id: string | null
}

interface CountRow {
  id: string
  expected_item_count: number
  closed_at: string | null
}

interface IngredientRow {
  id: string
  name: string
  unit_cost: number
  stock_unit_id: string
}

interface UnitRow {
  id: string
  abbreviation: string
}

/**
 * The report for one Manila day.
 *
 * The window is half-open (`>= start`, `< end`) so consecutive days tile the
 * timeline and no movement is ever counted twice.
 */
export async function getDailyInventoryReport(
  tenantId: string,
  dayKey: string,
  outletId?: string | null,
): Promise<DailyInventoryReportForDay> {
  const supabase = await createClient()
  const { startIso, endIso } = resolveBusinessDayWindow(dayKey)

  /**
   * Narrowed to one branch, or left whole.
   *
   * An absent branch is the OWNER's report and must acquire no filter by
   * accident: an owner silently narrowed to one branch would see a fraction of
   * their own stock with nothing on screen to say so.
   *
   * Each query is written out in full rather than built by a generic over
   * the query builder, which sends `tsc` into "type instantiation is
   * excessively deep" on these types; only the paging is shared.
   */
  const countQuery = supabase
    .from('inventory_counts')
    .select('id, expected_item_count, closed_at')
    .eq('tenant_id', tenantId)
    .eq('business_day', dayKey)

  const [movementRows, ingredientRows, unitRows, countResult] = await Promise.all([
    readAll<MovementRow>('stock movements', (from, to) => {
      const query = supabase
        .from('stock_movements')
        .select(
          'inventory_item_id, reason, quantity_delta, balance_after, created_at, inventory_count_id, outlet_id',
        )
        .eq('tenant_id', tenantId)
        .gte('created_at', startIso)
        .lt('created_at', endIso)
      // `id` breaks created_at ties so pages read concurrently never overlap.
      return (outletId ? query.eq('outlet_id', outletId) : query)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    }),
    readAll<IngredientRow>('ingredients', (from, to) =>
      supabase
        .from('inventory_items')
        .select('id, name, unit_cost, stock_unit_id')
        .eq('tenant_id', tenantId)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    readAll<UnitRow>('units', (from, to) =>
      supabase
        .from('inventory_units')
        .select('id, abbreviation')
        .eq('tenant_id', tenantId)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    // The day's count, if the merchant opened one. Latest first, because a
    // shelf recounted in the evening is the one that describes how the day
    // ended — the morning's abandoned attempt is not the last word on it.
    // Scoped to the same branch as the ledger. Otherwise coverage is measured
    // against a count opened for another shelf — or against the store pool's,
    // whose denominator counts ingredients this branch never stocks.
    (outletId ? countQuery.eq('outlet_id', outletId) : countQuery)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const unitAbbreviationById = new Map(
    unitRows.map((unit) => [unit.id, unit.abbreviation]),
  )

  const ingredients: DailyReportIngredient[] = ingredientRows.map((row) => ({
    id: row.id,
    name: row.name,
    // A null cost is "never priced", which the report counts and reports rather
    // than quietly treating as free.
    unitCost: row.unit_cost ?? 0,
    stockUnitAbbreviation: unitAbbreviationById.get(row.stock_unit_id) ?? '',
  }))

  const movements: DailyReportMovement[] = movementRows.map((row) => ({
    inventoryItemId: row.inventory_item_id,
    reason: row.reason,
    quantityDelta: row.quantity_delta,
    balanceAfter: row.balance_after,
    createdAt: row.created_at,
    // `balance_after` is a per-branch running total, so the reconciliation
    // needs to know which shelf each row belongs to.
    outletId: row.outlet_id,
  }))

  return {
    dayKey,
    countSession: judgeDaysCount(
      countResult.error ? null : ((countResult.data as unknown as CountRow) ?? null),
      movementRows,
    ),
    ...buildDailyInventoryReport({ movements, ingredients }),
  }
}

/**
 * How far the day's count got, from the movements filed under it.
 *
 * The counted ingredients come from the movements already read for the report
 * rather than a second query — they are the same rows, and a stocktake belongs
 * to the day whose shelf it counted.
 *
 * A stocktake carrying no session is deliberately not credited: a one-off
 * correction made during a count is not part of the count, and crediting it
 * would raise coverage for an ingredient nobody counted.
 *
 * A failed session read yields `null` rather than throwing. The stock figures
 * are independently true, and losing the whole report because its caveat could
 * not be computed would be a worse trade than losing the caveat.
 */
function judgeDaysCount(
  count: CountRow | null,
  movements: readonly MovementRow[],
): CountSessionProgress | null {
  if (!count) return null

  return judgeCountSession({
    expectedItemCount: Number(count.expected_item_count),
    countedItemIds: movements
      .filter((row) => row.inventory_count_id === count.id)
      .map((row) => row.inventory_item_id),
    closedAt: count.closed_at,
  })
}

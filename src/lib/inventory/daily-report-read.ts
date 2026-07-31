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
): Promise<DailyInventoryReportForDay> {
  const supabase = await createClient()
  const { startIso, endIso } = resolveBusinessDayWindow(dayKey)

  const [movementResult, ingredientResult, unitResult, countResult] = await Promise.all([
    supabase
      .from('stock_movements')
      .select(
        'inventory_item_id, reason, quantity_delta, balance_after, created_at, inventory_count_id',
      )
      .eq('tenant_id', tenantId)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true }),
    supabase
      .from('inventory_items')
      .select('id, name, unit_cost, stock_unit_id')
      .eq('tenant_id', tenantId),
    supabase.from('inventory_units').select('id, abbreviation').eq('tenant_id', tenantId),
    // The day's count, if the merchant opened one. Latest first, because a
    // shelf recounted in the evening is the one that describes how the day
    // ended — the morning's abandoned attempt is not the last word on it.
    supabase
      .from('inventory_counts')
      .select('id, expected_item_count, closed_at')
      .eq('tenant_id', tenantId)
      .eq('business_day', dayKey)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (movementResult.error) throw movementResult.error
  if (ingredientResult.error) throw ingredientResult.error
  if (unitResult.error) throw unitResult.error

  const unitAbbreviationById = new Map(
    ((unitResult.data ?? []) as unknown as UnitRow[]).map((unit) => [unit.id, unit.abbreviation]),
  )

  const ingredients: DailyReportIngredient[] = (
    (ingredientResult.data ?? []) as unknown as IngredientRow[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    // A null cost is "never priced", which the report counts and reports rather
    // than quietly treating as free.
    unitCost: row.unit_cost ?? 0,
    stockUnitAbbreviation: unitAbbreviationById.get(row.stock_unit_id) ?? '',
  }))

  const movements: DailyReportMovement[] = (
    (movementResult.data ?? []) as unknown as MovementRow[]
  ).map((row) => ({
    inventoryItemId: row.inventory_item_id,
    reason: row.reason,
    quantityDelta: row.quantity_delta,
    balanceAfter: row.balance_after,
    createdAt: row.created_at,
  }))

  return {
    dayKey,
    countSession: judgeDaysCount(
      countResult.error ? null : ((countResult.data as unknown as CountRow) ?? null),
      (movementResult.data ?? []) as unknown as MovementRow[],
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

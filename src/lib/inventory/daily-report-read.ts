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

export interface DailyInventoryReportForDay extends DailyInventoryReport {
  /** The Manila day this covers, `YYYY-MM-DD`. */
  dayKey: string
}

interface MovementRow {
  inventory_item_id: string
  reason: StockMovementReason
  quantity_delta: number
  balance_after: number
  created_at: string
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

  const [movementResult, ingredientResult, unitResult] = await Promise.all([
    supabase
      .from('stock_movements')
      .select('inventory_item_id, reason, quantity_delta, balance_after, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true }),
    supabase
      .from('inventory_items')
      .select('id, name, unit_cost, stock_unit_id')
      .eq('tenant_id', tenantId),
    supabase.from('inventory_units').select('id, abbreviation').eq('tenant_id', tenantId),
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

  return { dayKey, ...buildDailyInventoryReport({ movements, ingredients }) }
}

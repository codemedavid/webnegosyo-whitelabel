/**
 * Shared primitives for order-driven ledger writes: the result shape every
 * order stock operation reports, and the one place a batch of order movements
 * is written, alerted on and named for the audit log.
 *
 * Sale, reversal and un-cancel all used to repeat "read items, insert, sum
 * deltas, alert, build lines" by hand; a fix to one copy (reading the items
 * BEFORE the insert, so alerts don't race the running-total trigger) had to be
 * remembered in all three.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'
import { applySimpleOptionStock } from './simple-option-stock-service'
import { reportStockFailure } from './stock-failure-report'
import { buildAuditLines, type StockAuditLine, type StockAuditOutcome } from './stock-audit'
import type { InventoryUnit } from './unit-conversion'

export type AdminClient = ReturnType<typeof createAdminClient>

export interface OrderStockResult {
  /** Movements actually written. Zero is normal — most menus are partly costed. */
  movementCount: number
  /** Ingredients skipped because a unit could not be resolved. */
  skipped: string[]
  /**
   * What happened, for the audit log. `duplicate` is the one worth watching: a
   * second caller tried to move this order's stock and the claim refused it.
   */
  outcome: StockAuditOutcome
  /** The ingredient ledger rows written, named — empty unless `applied`. */
  lines: StockAuditLine[]
}

export const EMPTY_RESULT: OrderStockResult = {
  movementCount: 0,
  skipped: [],
  outcome: 'nothing_to_deduct',
  lines: [],
}

/** A result that wrote nothing, for the stated reason. */
export function unwritten(outcome: StockAuditOutcome, movementCount = 0): OrderStockResult {
  return { ...EMPTY_RESULT, outcome, movementCount }
}

/** One `stock_movements` row written on an order's behalf. */
export interface OrderLedgerRow {
  tenant_id: string
  inventory_item_id: string
  outlet_id: string | null
  reason: 'sale' | 'void'
  quantity_delta: number
  entered_quantity: number | null
  entered_unit_id: string | null
  order_id: string
}

export function toUnit(row: InventoryUnitRow): InventoryUnit {
  return {
    id: row.id,
    name: row.name,
    abbreviation: row.abbreviation,
    dimension: row.dimension,
    to_base_factor: row.to_base_factor,
  }
}

/**
 * The one branch a batch of ledger rows belongs to, or `undefined` if they
 * straddle more than one.
 *
 * A reversal reads its branch off the recorded movements, and an order whose
 * branch was corrected mid-life can have legs on two shelves. Naming one of
 * them would alert about a shelf half the rows never touched, so an ambiguous
 * batch falls back to the store-wide behaviour it has always had.
 */
export function soleOutletId(
  rows: ReadonlyArray<{ outlet_id?: unknown }>,
): string | null | undefined {
  if (rows.length === 0) return undefined
  const outletOf = (row: { outlet_id?: unknown }) =>
    typeof row.outlet_id === 'string' ? row.outlet_id : null

  const first = outletOf(rows[0])
  return rows.every((row) => outletOf(row) === first) ? first : undefined
}

/**
 * The per-option counter RPC, isolated from the ingredient ledger.
 *
 * It runs in its own transaction and raises "Insufficient stock" when a
 * counter would go below zero — the register has no preflight for it. Letting
 * that throw used to abort the whole order's ingredient depletion, so a dish
 * that was sold left every ingredient on the shelf. The counter failure is
 * reported and the ingredients still move.
 */
export async function applySimpleOptionStockIsolated(
  ...args: Parameters<typeof applySimpleOptionStock>
): Promise<number> {
  try {
    return await applySimpleOptionStock(...args)
  } catch (error) {
    const [, tenantId, orderId, action, revision] = args
    reportStockFailure({ tenantId, orderId, operation: `simple_option_${action}` as const, revision }, error)
    return 0
  }
}

/**
 * Runs the alert path without letting it affect the movement that triggered it.
 * `processStockLevelChanges` already swallows its own errors; this guards the
 * call itself, so a broken alert module can never unwind a recorded sale.
 */
async function notifyStockLevelChanges(
  tenantId: string,
  items: readonly InventoryItem[],
  deltas: ReadonlyMap<string, number>,
  outletId?: string | null,
): Promise<void> {
  try {
    const { processStockLevelChanges } = await import('@/lib/inventory/stock-alerts-service')
    await processStockLevelChanges(tenantId, items, deltas, outletId)
  } catch (error) {
    console.error('[inventory] Stock level alerting failed', tenantId, error)
  }
}

function sumDeltasByItem(rows: readonly OrderLedgerRow[]): Map<string, number> {
  const deltas = new Map<string, number>()
  for (const row of rows) {
    deltas.set(row.inventory_item_id, (deltas.get(row.inventory_item_id) ?? 0) + row.quantity_delta)
  }
  return deltas
}

/**
 * The PRE-movement ingredient rows the alert path compares against. A failed
 * read only costs the alert and the audit names — never the movement.
 */
async function readItemsForAlerts(
  supabase: AdminClient,
  tenantId: string,
  rows: readonly OrderLedgerRow[],
): Promise<InventoryItem[]> {
  const { data } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('id', [...new Set(rows.map((row) => row.inventory_item_id))])
  return (data ?? []) as unknown as InventoryItem[]
}

/**
 * Write an order's ledger rows, then alert on the shelves they crossed.
 *
 * Items are read BEFORE the insert (or passed in by a caller that already
 * holds them): re-reading afterwards would race the running-total trigger and
 * could compare a quantity against itself, detecting no crossing at all.
 * Throws when the insert fails; the caller owns releasing its claim.
 */
export async function writeOrderLedgerRows(
  supabase: AdminClient,
  tenantId: string,
  rows: readonly OrderLedgerRow[],
  knownItems?: readonly InventoryItem[],
): Promise<OrderStockResult> {
  const inventoryItems = knownItems ?? (await readItemsForAlerts(supabase, tenantId, rows))

  const { error } = await supabase.from('stock_movements').insert(rows as never)
  if (error) throw error

  await notifyStockLevelChanges(tenantId, inventoryItems, sumDeltasByItem(rows), soleOutletId(rows))

  return {
    movementCount: rows.length,
    skipped: [],
    outcome: 'applied',
    lines: buildAuditLines(rows, new Map(inventoryItems.map((item) => [item.id, item.name]))),
  }
}

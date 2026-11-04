/**
 * Shared primitives for order-driven ledger writes: the result shape every
 * order stock operation reports, and the one place a batch of order movements
 * is written, alerted on and named for the audit log.
 *
 * Sale, reversal and un-cancel all used to repeat "read items, insert, sum
 * deltas, alert, build lines" by hand; a fix to one copy (reading the items
 * BEFORE the insert, so alerts don't race the running-total trigger) had to be
 * remembered in all three. Every write now goes through
 * `apply_order_stock_claim` (`order-stock-commit.ts`): claim and rows commit
 * together.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'
import { applySimpleOptionStockSettled, type SimpleOptionStockResult } from './simple-option-stock-service'
import { reportStockFailure } from './stock-failure-report'
import { buildAuditLines, type StockAuditLine, type StockAuditOutcome } from './stock-audit'
import type { InventoryUnit } from './unit-conversion'
import {
  commitOrderStockClaim,
  commitOrderStockReversal,
  type CommittedOrderStock,
  type OrderStockClaimTarget,
  type OrderStockMovementInput,
} from './order-stock-commit'

/** Ungated, like `Logger.error`: a skipped alert must reach the platform log. */
const log = {
  error(message: string, data: Record<string, unknown>): void {
    console.error(`[inventory] ${message}`, data)
  },
}

export type AdminClient = ReturnType<typeof createAdminClient>

/**
 * What a best-effort order stock write tells its caller. The wrappers never
 * throw; `failed` means nothing was written (every claim was handed back), so
 * a caller that can retry should.
 */
export type StockWriteOutcome = 'settled' | 'failed'

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
  /**
   * Simple option counters that could not cover the sale ("Cheese: 5 sold,
   * 3 in stock"). Terminal: the counters took what they had, nothing retries.
   */
  shortfalls?: string[]
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
 * It runs in its own transaction. A counter that would go below zero no longer
 * throws out of `applySimpleOptionStockSettled` (it decrements what is there
 * and names the shortfall), so what still lands here is a real outage. That
 * used to abort the whole order's ingredient depletion, so a dish that was
 * sold left every ingredient on the shelf. The counter failure is reported and
 * the ingredients still move.
 */
export async function applySimpleOptionStockIsolated(
  ...args: Parameters<typeof applySimpleOptionStockSettled>
): Promise<SimpleOptionStockResult> {
  try {
    return await applySimpleOptionStockSettled(...args)
  } catch (error) {
    const [, tenantId, orderId, action, revision] = args
    reportStockFailure({ tenantId, orderId, operation: `simple_option_${action}` as const, revision }, error)
    return { count: 0, shortfalls: [] }
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

function sumDeltasByItem(rows: readonly OrderStockMovementInput[]): Map<string, number> {
  const deltas = new Map<string, number>()
  for (const row of rows) {
    deltas.set(row.inventory_item_id, (deltas.get(row.inventory_item_id) ?? 0) + row.quantity_delta)
  }
  return deltas
}

/**
 * The PRE-movement ingredient rows the alert path compares against, or null
 * when they could not be read. A failed read only costs the alert and the
 * audit names — never the movement — and is said out loud: reading it as "no
 * items" would silently skip a low-stock alert.
 */
export async function readItemsForAlerts(
  supabase: AdminClient,
  tenantId: string,
  itemIds: readonly string[],
): Promise<InventoryItem[] | null> {
  const ids = [...new Set(itemIds)]
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('id', ids)
  if (error) {
    log.error('Could not read ingredients before an order movement; skipping its stock alerts', {
      tenantId, itemCount: ids.length, error,
    })
    return null
  }
  return (data ?? []) as unknown as InventoryItem[]
}

function toMovementInput(row: OrderLedgerRow): OrderStockMovementInput {
  return {
    inventory_item_id: row.inventory_item_id,
    outlet_id: row.outlet_id,
    reason: row.reason,
    quantity_delta: row.quantity_delta,
    entered_quantity: row.entered_quantity,
    entered_unit_id: row.entered_unit_id,
  }
}

/** Alert on the shelves a committed write crossed, and name it for the audit. */
async function settleCommitted(
  tenantId: string,
  committed: CommittedOrderStock,
  inventoryItems: readonly InventoryItem[] | null,
): Promise<OrderStockResult> {
  if (committed.status !== 'applied') return unwritten(committed.status)
  if (committed.rows.length === 0) return EMPTY_RESULT
  if (inventoryItems) {
    await notifyStockLevelChanges(tenantId, inventoryItems, sumDeltasByItem(committed.rows), soleOutletId(committed.rows))
  }
  return {
    movementCount: committed.rows.length,
    skipped: [],
    outcome: 'applied',
    lines: buildAuditLines(committed.rows, new Map((inventoryItems ?? []).map((item) => [item.id, item.name]))),
  }
}

/**
 * Claim `target` and write an order's ledger rows WITH it (one transaction),
 * then alert on the shelves they crossed.
 *
 * Items are read BEFORE the write (or passed in by a caller that already holds
 * them): re-reading afterwards would race the running-total trigger and could
 * compare a quantity against itself, detecting no crossing at all.
 * `duplicate` / `cancelled_first` come back as unwritten results. Throws when
 * the database refused; nothing was written then, so a retry is safe.
 */
export async function commitOrderLedgerRows(
  supabase: AdminClient,
  target: OrderStockClaimTarget,
  rows: readonly OrderLedgerRow[],
  knownItems?: readonly InventoryItem[],
): Promise<OrderStockResult> {
  const inventoryItems = knownItems
    ?? (rows.length > 0 ? await readItemsForAlerts(supabase, target.tenantId, rows.map((row) => row.inventory_item_id)) : [])
  const committed = await commitOrderStockClaim(supabase, target, rows.map(toMovementInput))
  return settleCommitted(target.tenantId, committed, inventoryItems)
}

/**
 * Cancel: claim the void at `revision` and reverse everything the order
 * recorded, in one transaction. The ingredients are read first (from the
 * order's own movements) so the alert path has the pre-movement rows.
 */
export async function commitOrderLedgerReversal(
  supabase: AdminClient,
  tenantId: string,
  orderId: string,
  revision: number,
): Promise<OrderStockResult> {
  const { data, error } = await supabase
    .from('stock_movements')
    .select('inventory_item_id')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
  let inventoryItems: InventoryItem[] | null = null
  if (error) {
    log.error('Could not read an order\'s movements before its reversal; skipping its stock alerts', { tenantId, orderId, error })
  } else {
    const itemIds = ((data ?? []) as { inventory_item_id: string }[]).map((row) => row.inventory_item_id)
    inventoryItems = await readItemsForAlerts(supabase, tenantId, itemIds)
  }
  const committed = await commitOrderStockReversal(supabase, tenantId, orderId, revision)
  return settleCommitted(tenantId, committed, inventoryItems)
}

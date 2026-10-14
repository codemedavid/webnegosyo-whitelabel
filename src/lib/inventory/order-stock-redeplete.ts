/**
 * Un-cancel: spend a re-opened order's ingredients again.
 *
 * Cancelling restored the stock and burned the order's ('sale', n) and
 * ('void', n) claims, so flipping the order back to an active status used to
 * leave its ingredients on the shelf forever. This re-depletes at a FRESH
 * revision (one above every claim in the order's own namespace — edits number
 * theirs separately), so a second cancellation can claim its matching void and
 * the pair never collides.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { isUuid } from '@/lib/uuid'
import { readInventorySelectionSnapshot } from '@/lib/inventory-selection-snapshot'
import type { DepletionOrderItem } from './order-depletion'
import { resolveMovementOutletId } from './stock-location'
import { buildDepletionItemsFromOrderRows, type OrderItemRow } from './customer-order-items'
import { reportStockFailure } from './stock-failure-report'
import type { StockAuditContext } from './stock-audit'
import {
  claimOrderStockApplication,
  releaseOrderStockApplication,
  listOrderStockClaims,
  resolveRedepletionRevision,
  hasBlockingVoidClaim,
  isLatestSaleReversed,
  latestCancellationRestored,
  type OrderStockClaimRow,
  type RestoredMovement,
  type SimpleOptionClaimRow,
} from './order-stock-claim'
import {
  EMPTY_RESULT,
  unwritten,
  soleOutletId,
  applySimpleOptionStockIsolated,
  writeOrderLedgerRows,
  type AdminClient,
  type OrderLedgerRow,
  type OrderStockResult,
  type StockWriteOutcome,
} from './order-stock-ledger'
import { SYSTEM_CONTEXT, auditOrderStock, warnSkipped, type OrderAuditTarget } from './order-stock-audit'
import { applyOrderStockMovements } from './order-stock-movements'

interface SavedOrder {
  outletId: string | null
  items: DepletionOrderItem[]
}

/**
 * Spend an un-cancelled order's ingredients again.
 *
 * WHAT it spends is exactly what the latest cancellation put back, read off
 * that cancellation's claim. Recomputing from `order_items` lost every option
 * and add-on recipe (register lines carry no option ids, and a web order's
 * snapshot goes stale once it is edited). Only a cancellation that predates
 * that record falls back to recomputing from the order's saved lines — which
 * needs a platform order row; Convex orders have none here.
 *
 * The caller supplies nothing steerable. Best-effort: a stock write must never
 * make a status change fail.
 */
export async function redepleteOrderStockBestEffort(
  tenantId: string,
  orderId: string,
  context: StockAuditContext = SYSTEM_CONTEXT,
): Promise<StockWriteOutcome> {
  const target: OrderAuditTarget = {
    tenantId, orderId, event: 'order_redeplete', context, revision: null, outletId: null,
  }
  try {
    const supabase = createAdminClient()
    const claims = await listOrderStockClaims(supabase, tenantId, orderId)
    const simpleClaims = await listSimpleOptionClaims(supabase, tenantId, orderId)

    // Never spend an order twice: un-cancel re-deducts only a sale that a
    // cancellation actually put back (a skipped restore or a repeated
    // un-cancel lands here).
    if (!isLatestSaleReversed(claims, simpleClaims)) {
      await auditOrderStock(target, { result: unwritten('duplicate') })
      return 'settled'
    }

    const revision = nextRedepletionRevision(claims, simpleClaims)
    const order = await readSavedOrder(supabase, tenantId, orderId)
    const restored = latestCancellationRestored(claims)

    if (restored) {
      const result = await respendRestoredMovements(supabase, tenantId, orderId, restored, revision)
      // Per-option counters are not in the ingredient record; they still need
      // the lines, and fail independently of the ingredients. They run only
      // once the ingredients are settled, so a failed ingredient write leaves
      // no counter claim behind to collide with its retry.
      if (isSettled(result) && order.items.length > 0) {
        await applySimpleOptionStockIsolated(
          supabase, tenantId, orderId, 'sale', revision, order.items, resolveMovementOutletId(order.outletId),
        )
      }
      await finishRedepletion(supabase, { ...target, revision, outletId: soleOutletId(restored) ?? order.outletId }, result)
      return 'settled'
    }

    if (order.items.length === 0) {
      await markOrderReopened(supabase, tenantId, orderId, revision)
      return 'settled'
    }
    const result = await applyOrderStockMovements(tenantId, orderId, order.items, 'sale', revision, order.outletId)
    warnSkipped('[inventory] Skipped stock movements for un-cancelled order', orderId, result)
    await finishRedepletion(supabase, { ...target, revision, outletId: order.outletId }, result)
    return 'settled'
  } catch (error) {
    reportStockFailure({ tenantId, orderId, operation: 'redeplete_order_stock' }, error)
    await auditOrderStock(target, { error })
    return 'failed'
  }
}

/** The un-cancel spent its ingredients, or had none to spend. */
function isSettled(result: OrderStockResult): boolean {
  return result.outcome === 'applied' || result.outcome === 'nothing_to_deduct'
}

async function finishRedepletion(
  supabase: AdminClient,
  target: OrderAuditTarget & { revision: number },
  result: OrderStockResult,
): Promise<void> {
  if (result.outcome === 'nothing_to_deduct') {
    await markOrderReopened(supabase, target.tenantId, target.orderId, target.revision)
  }
  await auditOrderStock(target, { result })
}

async function listSimpleOptionClaims(
  supabase: AdminClient,
  tenantId: string,
  orderId: string,
): Promise<SimpleOptionClaimRow[]> {
  const { data, error } = await supabase
    .from('simple_option_stock_applications')
    .select('action, revision')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
  if (error) throw error
  return (data ?? []) as SimpleOptionClaimRow[]
}

/** One above every claim in the order's namespace, simple-option counters included. */
function nextRedepletionRevision(
  claims: readonly OrderStockClaimRow[],
  simpleClaims: readonly SimpleOptionClaimRow[],
): number {
  return Math.max(
    resolveRedepletionRevision(claims),
    ...simpleClaims.map((claim) => Number(claim.revision) + 1),
  )
}

/**
 * The platform order's branch and saved lines. A Convex or tenant-Supabase
 * order has no row here; the restored record alone is enough to re-spend its
 * ingredients.
 */
async function readSavedOrder(
  supabase: AdminClient,
  tenantId: string,
  orderId: string,
): Promise<SavedOrder> {
  if (!isUuid(orderId)) return { outletId: null, items: [] }
  const { data, error } = await supabase
    .from('orders')
    .select('id, outlet_id, customer_data')
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw error
  if (!data) return { outletId: null, items: [] }

  const row = data as { outlet_id?: string | null; customer_data?: unknown }
  return {
    outletId: row.outlet_id ?? null,
    items: await readSavedDepletionItems(supabase, orderId, row.customer_data),
  }
}

/** A platform order's saved lines, configured by its selection snapshot when it has one. */
async function readSavedDepletionItems(
  supabase: AdminClient,
  orderId: string,
  customerData: unknown,
): Promise<DepletionOrderItem[]> {
  const { data: itemRows, error: itemsError } = await supabase
    .from('order_items')
    .select('menu_item_id, quantity')
    .eq('order_id', orderId)
  if (itemsError) throw itemsError

  const savedItems = buildDepletionItemsFromOrderRows((itemRows ?? []) as unknown as OrderItemRow[])
  return readInventorySelectionSnapshot(customerData, savedItems) ?? savedItems
}

/**
 * Leave a sale claim behind when an un-cancel had nothing to spend.
 *
 * Otherwise the cancellation's kept claim stays the order's latest word, the
 * re-opened order still reads as cancelled, and every later edit stands down
 * (`isCancelledByClaims`). A lost race (someone else claimed it) is fine.
 */
async function markOrderReopened(
  supabase: AdminClient,
  tenantId: string,
  orderId: string,
  revision: number,
): Promise<void> {
  await claimOrderStockApplication(supabase, tenantId, orderId, 'sale', revision)
}

function toRespendRows(
  tenantId: string,
  orderId: string,
  restored: readonly RestoredMovement[],
): OrderLedgerRow[] {
  // Every non-zero row is undone, whichever way it went: a cancellation that
  // took stock OUT (an order whose net was positive) is put back by the
  // un-cancel, not left on the shelf.
  return restored
    .filter((entry) => Number(entry.quantity_delta) !== 0)
    .map((entry) => ({
      tenant_id: tenantId,
      inventory_item_id: entry.inventory_item_id,
      outlet_id: entry.outlet_id ?? null,
      reason: Number(entry.quantity_delta) > 0 ? ('sale' as const) : ('void' as const),
      quantity_delta: -Number(entry.quantity_delta),
      entered_quantity: entry.entered_quantity,
      entered_unit_id: entry.entered_unit_id,
      order_id: orderId,
    }))
}

/**
 * Write back, as a sale, exactly the ledger rows a cancellation returned.
 *
 * Same claim discipline as `applyOrderStockMovements`: claim first, stand down
 * if a newer cancellation has spoken, hand the claim back on any exit that
 * writes nothing.
 */
async function respendRestoredMovements(
  supabase: AdminClient,
  tenantId: string,
  orderId: string,
  restored: readonly RestoredMovement[],
  revision: number,
): Promise<OrderStockResult> {
  if (!(await claimOrderStockApplication(supabase, tenantId, orderId, 'sale', revision))) {
    return unwritten('duplicate')
  }
  const release = () => releaseOrderStockApplication(supabase, tenantId, orderId, 'sale', revision)
  try {
    const claims = await listOrderStockClaims(supabase, tenantId, orderId)
    if (hasBlockingVoidClaim(claims, revision)) {
      await release()
      return unwritten('cancelled_first')
    }

    const rows = toRespendRows(tenantId, orderId, restored)
    if (rows.length === 0) {
      await release()
      return EMPTY_RESULT
    }
    return await writeOrderLedgerRows(supabase, tenantId, rows)
  } catch (error) {
    await release()
    throw error
  }
}

/**
 * Order-driven stock depletion.
 *
 * Stock lives in the platform Supabase for every tenant, whatever backend holds
 * their orders — Convex, their own Supabase project, or the shared platform DB.
 * All three converge in `createOrderAction`, so depletion hooks in once here and
 * serves all of them rather than being reimplemented per backend.
 *
 * Every write goes through the same append-only ledger a merchant uses by hand,
 * so an order's effect on stock is visible in the same history and reversible
 * by the same mechanism.
 *
 * This module is the public surface: the best-effort wrappers callers use on
 * request paths. The claimed ledger operations live in `order-stock-movements`,
 * un-cancel in `order-stock-redeplete`, shared write primitives in
 * `order-stock-ledger` and the audit trail in `order-stock-audit`.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { applySimpleOptionStock } from './simple-option-stock-service'
import type { DepletionOrderItem } from './order-depletion'
import { reportStockFailure } from './stock-failure-report'
import type { StockAuditContext } from './stock-audit'
import { applyOrderStockMovements, reverseOrderStockMovements } from './order-stock-movements'
import {
  SYSTEM_CONTEXT,
  auditOrderStock,
  warnSkipped,
  type OrderAuditTarget,
  type OrderStockAuditOptions,
} from './order-stock-audit'

export { applyOrderStockMovements, reverseOrderStockMovements } from './order-stock-movements'
export { redepleteOrderStockBestEffort } from './order-stock-redeplete'
export type { OrderStockResult } from './order-stock-ledger'
export type { OrderStockAuditOptions } from './order-stock-audit'

/** Never throws: a stock write must not make an order un-cancellable. */
export async function reverseOrderStockBestEffort(
  tenantId: string,
  orderId: string,
  context: StockAuditContext = SYSTEM_CONTEXT,
): Promise<void> {
  const target: OrderAuditTarget = {
    tenantId, orderId, event: 'order_restore', context, revision: null, outletId: null,
  }
  try {
    const result = await reverseOrderStockMovements(tenantId, orderId)
    await auditOrderStock(target, { result })
  } catch (error) {
    reportStockFailure({ tenantId, orderId, operation: 'reverse_order_stock' }, error)
    await auditOrderStock(target, { error })
  }
}

/**
 * Fire-and-forget depletion for the order-creation path.
 *
 * Never throws and never blocks: the order is already saved and paid for by the
 * time this runs. A stock system that can lose a customer's order is worse than
 * one whose numbers drift — the ledger is reconcilable, a lost order is not.
 */
export async function applyOrderStockBestEffort(
  tenantId: string,
  orderId: string,
  items: readonly DepletionOrderItem[],
  direction: 'sale' | 'void' = 'sale',
  revision: number = 0,
  outletId: string | null = null,
  audit: OrderStockAuditOptions = {},
): Promise<void> {
  // An order with no lines has nothing to move and nothing worth a log row.
  if (items.length === 0) return
  const target: OrderAuditTarget = {
    tenantId,
    orderId,
    event: audit.event ?? (direction === 'sale' ? 'order_sale' : 'order_restore'),
    context: audit.context ?? SYSTEM_CONTEXT,
    revision,
    outletId,
  }
  try {
    const result = await applyOrderStockMovements(
      tenantId,
      orderId,
      items,
      direction,
      revision,
      outletId,
      audit.kind ?? 'order',
    )
    warnSkipped('[inventory] Skipped stock movements for order', orderId, result)
    await auditOrderStock(target, { result })
  } catch (error) {
    // `applyOrderRevisionStockBestEffort` funnels through here too, so the
    // revision being saved rides along whenever the caller passed one.
    reportStockFailure({ tenantId, orderId, operation: 'apply_order_stock', revision }, error)
    await auditOrderStock(target, { error })
  }
}

/**
 * Move the stock a saved order edit is responsible for.
 *
 * An edit moves only the DIFFERENCE — the order's original sale already spent
 * its ingredients. Both directions can appear in one edit (a customer swaps a
 * bun for a latte), so this writes up to two ledger entries and claims each
 * against the revision being saved.
 *
 * Best-effort, like every other order-driven stock write: by the time this runs
 * the bill has been rewritten and the money settled. A drifting ledger is
 * reconcilable by stocktake; a save that refuses to complete because of a stock
 * write leaves the customer holding a receipt that disagrees with the kitchen.
 */
export async function applyOrderRevisionStockBestEffort(
  tenantId: string,
  orderId: string,
  revision: number,
  deplete: readonly DepletionOrderItem[],
  restore: readonly DepletionOrderItem[],
  outletId: string | null = null,
  context: StockAuditContext = SYSTEM_CONTEXT,
): Promise<void> {
  // Simple counters enforce a floor: return the old configuration first so a
  // swap can reuse its own stock. The RPC distinguishes edits from cancellation
  // and retries below are no-ops under its independent transaction claims.
  try {
    const supabase = createAdminClient()
    if (restore.length) await applySimpleOptionStock(supabase, tenantId, orderId, 'void', revision, restore, outletId)
    if (deplete.length) await applySimpleOptionStock(supabase, tenantId, orderId, 'sale', revision, deplete, outletId)
  } catch (error) {
    reportStockFailure({ tenantId, orderId, operation: 'revise_simple_option_stock' }, error)
  }
  // Edit claims live in their own namespace ('edit'), numbered by the order's
  // own revision counter, so an edit's return never reads as a cancellation
  // and never collides with an un-cancel's revision.
  if (deplete.length > 0) {
    await applyOrderStockBestEffort(tenantId, orderId, deplete, 'sale', revision, outletId, {
      context,
      event: 'order_edit',
      kind: 'edit',
    })
  }
  if (restore.length > 0) {
    await applyOrderStockBestEffort(tenantId, orderId, restore, 'void', revision, outletId, {
      context,
      event: 'order_edit',
      kind: 'edit',
    })
  }
}

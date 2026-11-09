/**
 * Stock follows an order through deletion, the way it follows a cancellation.
 *
 * Deleting an order gives its ingredients back (unless it was already
 * cancelled, which did so); restoring it spends them again. Both run AFTER the
 * database function has committed, and neither can fail the deletion or the
 * restore: stock is best-effort here exactly as it is on cancel. The per-order
 * operations are idempotent (the void claim, and the "latest sale was
 * reversed" guard on re-spending), so a repeat never moves stock twice.
 */
import { reportStockFailure } from '@/lib/inventory/stock-failure-report'
import type { ArchivedOrderRef, DeletionCaller, OrderDeletionRepo } from './types'

/** Orders settled at once; each is a few ledger calls on the shared database. */
const STOCK_CONCURRENCY = 5

export interface OrderStockEffects {
  giveBack(tenantId: string, orderId: string, actorUserId: string): Promise<void>
  takeAgain(tenantId: string, orderId: string, actorUserId: string): Promise<void>
  releasePresell(tenantId: string, customerData: unknown): Promise<void>
}

export interface StockSettlement {
  effects: OrderStockEffects
  /** Run after the response (Next `after`); tests run it inline. */
  defer(task: () => Promise<void>): void
}

const isLive = (order: ArchivedOrderRef) => order.status !== 'cancelled'

async function inBatches<T>(items: readonly T[], work: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += STOCK_CONCURRENCY) {
    await Promise.all(items.slice(i, i + STOCK_CONCURRENCY).map(work))
  }
}

async function readArchive(
  repo: OrderDeletionRepo,
  caller: DeletionCaller,
  deletionId: string,
  operation: 'order_deletion_stock' | 'order_restore_stock'
): Promise<ArchivedOrderRef[]> {
  try {
    return await repo.listArchivedOrders(deletionId, caller.tenantId)
  } catch (error) {
    reportStockFailure({ tenantId: caller.tenantId, operation }, error)
    return []
  }
}

/** After a deletion committed: return the stock of every archived, non-cancelled order. */
export async function giveBackDeletedOrdersStock(
  repo: OrderDeletionRepo,
  settlement: StockSettlement,
  caller: DeletionCaller,
  deletionId: string
): Promise<void> {
  const orders = (await readArchive(repo, caller, deletionId, 'order_deletion_stock')).filter(isLive)
  if (orders.length === 0) return
  settlement.defer(() =>
    inBatches(orders, async (order) => {
      try {
        await settlement.effects.giveBack(caller.tenantId, order.orderId, caller.userId)
        await settlement.effects.releasePresell(caller.tenantId, order.customerData)
      } catch (error) {
        reportStockFailure({ tenantId: caller.tenantId, orderId: order.orderId, operation: 'order_deletion_stock' }, error)
      }
    })
  )
}

/**
 * Before a restore (which empties the archive): remember who to re-spend for.
 * Unlike a deletion, a failed read THROWS: restoring without this list brings
 * the orders back while the stock they gave back stays on the shelf, and the
 * emptied archive leaves nothing to repair it from.
 */
export async function readOrdersToRespend(
  repo: OrderDeletionRepo,
  caller: DeletionCaller,
  deletionId: string
): Promise<ArchivedOrderRef[]> {
  try {
    return (await repo.listArchivedOrders(deletionId, caller.tenantId)).filter(isLive)
  } catch (error) {
    reportStockFailure({ tenantId: caller.tenantId, operation: 'order_restore_stock' }, error)
    throw error
  }
}

/** After a restore committed: spend again what each live order gave back. */
export function respendRestoredOrdersStock(
  settlement: StockSettlement,
  caller: DeletionCaller,
  orders: readonly ArchivedOrderRef[]
): void {
  if (orders.length === 0) return
  settlement.defer(() =>
    inBatches(orders, async (order) => {
      try {
        await settlement.effects.takeAgain(caller.tenantId, order.orderId, caller.userId)
      } catch (error) {
        reportStockFailure({ tenantId: caller.tenantId, orderId: order.orderId, operation: 'order_restore_stock' }, error)
      }
    })
  )
}

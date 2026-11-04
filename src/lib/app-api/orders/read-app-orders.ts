import type { AppOrderDetail, AppOrderPage } from '@/lib/app-contract'
import type { Logger } from '@/lib/logger'
import { rememberStatus, rowsToRefresh } from './live-status'
import type { OrderIndex, PlacedOrderRow } from './order-index'
import { toAppOrderDetail, toAppOrderSummary, type LiveOrderState } from './order-summary'
import { failOutcome, okOutcome, type AppOutcome } from './outcome'

/**
 * GET /orders/[id] and GET /me/orders, without HTTP. Only the caller's own
 * index rows are ever read (another customer's order is "not found"); the
 * live status comes from the order's backend and is written back when it
 * moved. A live read that fails answers from the snapshot — never an error.
 */

export const ORDER_NOT_FOUND = "We couldn't find that order."
export const BAD_CURSOR = 'That page of orders is no longer available. Pull to refresh.'

export interface ReadAppOrdersDeps {
  index: Pick<OrderIndex, 'getCustomerOrder' | 'listCustomerOrders' | 'recordStatus'>
  readLive: (tenantId: string, orderId: string) => Promise<LiveOrderState | null>
  log: Logger
  now?: () => Date
}

export interface CustomerScope {
  tenantId: string
  customerId: string
}

async function liveFor(scope: CustomerScope, row: PlacedOrderRow, deps: ReadAppOrdersDeps): Promise<LiveOrderState | null> {
  const live = await deps.readLive(scope.tenantId, row.orderId)
  if (live) await rememberStatus(deps.index, row, live.status, deps.log)
  return live
}

export async function getAppOrder(scope: CustomerScope, orderId: string, deps: ReadAppOrdersDeps): Promise<AppOutcome<AppOrderDetail>> {
  const row = await deps.index.getCustomerOrder(scope.tenantId, scope.customerId, orderId)
  if (!row) return failOutcome('not_found', ORDER_NOT_FOUND)
  return okOutcome(toAppOrderDetail(row, await liveFor(scope, row, deps)))
}

export async function listAppOrders(scope: CustomerScope, cursor: string | null, deps: ReadAppOrdersDeps): Promise<AppOutcome<AppOrderPage>> {
  const page = await deps.index.listCustomerOrders(scope.tenantId, scope.customerId, { cursor })
  if (!page.ok) return failOutcome('bad_request', BAD_CURSOR)

  const stale = rowsToRefresh(page.orders, (deps.now ?? (() => new Date()))())
  const refreshed = await Promise.all(stale.map(async (row) => [row.id, await liveFor(scope, row, deps)] as const))
  const liveById = new Map(refreshed)
  return okOutcome({
    orders: page.orders.map((row) => toAppOrderSummary(row, liveById.get(row.id) ?? null)),
    nextCursor: page.nextCursor,
  })
}

/**
 * One order status change → at most one Messenger message.
 *
 * Called from `/api/messenger/order-update`, which the
 * `orders_messenger_order_update` trigger posts `{ order_id }` to. Nothing in
 * the request is trusted: the order is re-read, the (order, status) claim in
 * `messenger_order_updates` makes a replay silent, and `decideOrderUpdate`
 * keeps every message inside Meta's 24h window. Side effects are injected so
 * the rules are testable without Meta or a database.
 */

import type { OutgoingMessage } from './graph-message'
import {
  decideOrderUpdate, defaultUpdateText, fillOrderText, isOrderStatus, orderLabel, readOrderKind,
  type OrderUpdatesConfig, type ReplyOrder, type UpdateSkipReason, type UpdateStatus,
} from './order-view'
import { buildOrderUpdate } from './replies'
import type { SendResult } from './send'

export interface UpdateOrderRow {
  id: string
  tenantId: string
  status: string
  dailyNumber: number | null
  orderType: string | null
  orderTypeId: string | null
  totalCentavos: number
  psid: string | null
}

export interface UpdateStore {
  name: string
  baseUrl: string | null
  isPlatformOrders: boolean
  botEnabled: boolean
  orderUpdates: OrderUpdatesConfig
  facebookPageRowId: string | null
}

export interface OrderUpdateDeps {
  now(): Date
  readOrder(orderId: string): Promise<UpdateOrderRow | null>
  /** Insert the (order, status) claim; false = already handled. */
  claim(input: { orderId: string; status: UpdateStatus; tenantId: string }): Promise<boolean>
  record(input: { orderId: string; status: UpdateStatus; outcome: OrderUpdateOutcome }): Promise<void>
  loadStore(tenantId: string): Promise<UpdateStore | null>
  readSession(tenantId: string, psid: string): Promise<{ lastInboundAt: Date | null; botPausedUntil: Date | null } | null>
  readOrderTypeKind(orderTypeId: string): Promise<string | null>
  findPageToken(tenantId: string, pageRowId: string): Promise<string | null>
  trackingUrl(baseUrl: string, orderId: string): string | null
  send(token: string, psid: string, messages: readonly OutgoingMessage[]): Promise<SendResult>
}

export type OrderUpdateOutcome = 'sent' | 'send_failed' | 'no_page' | 'no_store' | UpdateSkipReason

export type OrderUpdateResult =
  | { outcome: 'not_found' | 'not_an_update' | 'duplicate' }
  | { outcome: OrderUpdateOutcome; status: UpdateStatus }

function asUpdateStatus(status: string): UpdateStatus | null {
  return isOrderStatus(status) && status !== 'pending' ? status : null
}

export async function runOrderUpdate(orderId: string, deps: OrderUpdateDeps): Promise<OrderUpdateResult> {
  const order = await deps.readOrder(orderId)
  if (!order) return { outcome: 'not_found' }
  // The status NOW (a quick second change may already have moved it on; that one has its own claim).
  const status = asUpdateStatus(order.status)
  if (!status) return { outcome: 'not_an_update' }
  if (!(await deps.claim({ orderId, status, tenantId: order.tenantId }))) return { outcome: 'duplicate' }

  const finish = async (outcome: OrderUpdateOutcome): Promise<OrderUpdateResult> => {
    await deps.record({ orderId, status, outcome })
    return { outcome, status }
  }

  const store = await deps.loadStore(order.tenantId)
  if (!store || !store.baseUrl) return finish('no_store')
  const session = order.psid ? await deps.readSession(order.tenantId, order.psid) : null
  const decision = decideOrderUpdate({
    isPlatform: store.isPlatformOrders,
    hasPsid: Boolean(order.psid),
    botEnabled: store.botEnabled,
    config: store.orderUpdates,
    status,
    session,
    now: deps.now(),
  })
  if (!decision.send) return finish(decision.reason)
  if (!store.facebookPageRowId || !order.psid) return finish('no_page')
  const token = await deps.findPageToken(order.tenantId, store.facebookPageRowId)
  if (!token) return finish('no_page')

  const kind = readOrderKind(order.orderTypeId ? await deps.readOrderTypeKind(order.orderTypeId) : null, order.orderType)
  const replyOrder: ReplyOrder = {
    id: order.id,
    label: orderLabel(order.dailyNumber, order.id),
    status,
    kind,
    totalCentavos: order.totalCentavos,
    trackingUrl: deps.trackingUrl(store.baseUrl, order.id),
  }
  const custom = store.orderUpdates.texts[status]?.trim()
  const text = fillOrderText(custom || defaultUpdateText(status, kind), { store: store.name, order: replyOrder.label })
  const result = await deps.send(token, order.psid, buildOrderUpdate(text || defaultUpdateText(status, kind), replyOrder))
  return finish(result.ok ? 'sent' : 'send_failed')
}

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
import { botLine, type ChatLogLine } from './chat-log'
import { greetingName } from './messages/fill'
import {
  decideOrderUpdate, isOrderStatus, orderLabel, readOrderKind,
  type OrderUpdatesConfig, type ReplyOrder, type UpdateSkipReason, type UpdateStatus,
} from './order-view'
import { buildOrderUpdate } from './replies'
import type { MessageSettings } from './messages/registry'
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
  /** The store's wording; status messages are `orders.update.*` (legacy `order_updates.texts` folded in). */
  messages: MessageSettings
  facebookPageRowId: string | null
}

export interface OrderUpdateDeps {
  now(): Date
  readOrder(orderId: string): Promise<UpdateOrderRow | null>
  /** Insert the (order, status) claim; false = already handled. */
  claim(input: { orderId: string; status: UpdateStatus; tenantId: string }): Promise<boolean>
  record(input: { orderId: string; status: UpdateStatus; outcome: OrderUpdateOutcome }): Promise<void>
  loadStore(tenantId: string): Promise<UpdateStore | null>
  readSession(tenantId: string, psid: string): Promise<UpdateSession | null>
  readOrderTypeKind(orderTypeId: string): Promise<string | null>
  findPageToken(tenantId: string, pageRowId: string): Promise<string | null>
  trackingUrl(baseUrl: string, orderId: string): string | null
  send(token: string, psid: string, messages: readonly OutgoingMessage[]): Promise<SendResult>
  /** The chat log (a status message is a bot line). Never throws. */
  logChat?(input: { tenantId: string; sessionId: string; lines: readonly ChatLogLine[] }): Promise<void>
}

export interface UpdateSession {
  lastInboundAt: Date | null
  botPausedUntil: Date | null
  /** Present once 20261111224021 is applied. */
  id?: string
  firstName?: string | null
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
  const messages = buildOrderUpdate({ storeName: store.name, messages: store.messages, customerName: greetingName(session?.firstName) }, status, replyOrder)
  const result = await deps.send(token, order.psid, messages)
  const line = result.ok ? botLine(messages, deps.now()) : null
  if (line && session?.id && deps.logChat) {
    await deps.logChat({ tenantId: order.tenantId, sessionId: session.id, lines: [line] }).catch(() => undefined)
  }
  return finish(result.ok ? 'sent' : 'send_failed')
}

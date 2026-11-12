import type { AppOrderKind, AppPushedStatus } from '@/lib/app-contract'
import { toAppOrderStatus } from '@/lib/app-api/orders/status-map'
import { buildOrderPushMessages, isPushedStatus, orderPushText, type CustomerOrderPushMessage } from './order-push-words'

/**
 * One status change of an app order → at most one push per (order, status).
 *
 * Called from `/api/push/customer-order`, which the `orders_customer_app_push`
 * trigger posts `{ order_id }` to. Nothing in the request is trusted: the
 * order is re-read, it must be in the app's own index (customer_app_orders)
 * under the order's OWN store, and the (order, status) claim makes a replay
 * silent. Side effects are injected so the rules are testable without Expo or
 * a database.
 */

export interface PushOrderRow {
  id: string
  tenantId: string
  status: string
}

export interface PushIndexRow {
  customerId: string
  orderKind: AppOrderKind
  number: string | null
}

export type CustomerPushOutcome = 'sent' | 'partly_sent' | 'send_failed' | 'no_devices'

export interface SendSummary {
  /** Devices Expo accepted a ticket for. */
  accepted: number
}

export interface CustomerOrderPushDeps {
  readOrder(orderId: string): Promise<PushOrderRow | null>
  /** The app's index row for this order at this store; null = not an app order. */
  readIndexRow(tenantId: string, orderId: string): Promise<PushIndexRow | null>
  /** Insert the (order, status) claim; false = already handled. */
  claim(input: { orderId: string; status: AppPushedStatus; tenantId: string }): Promise<boolean>
  record(input: { orderId: string; status: AppPushedStatus; outcome: CustomerPushOutcome; devices: number }): Promise<void>
  /** Expo tokens of this customer's installs whose session is still live. */
  readTokens(tenantId: string, customerId: string): Promise<string[]>
  readStoreName(tenantId: string): Promise<string | null>
  send(tenantId: string, messages: readonly CustomerOrderPushMessage[]): Promise<SendSummary>
}

export type CustomerOrderPushResult =
  | { outcome: 'not_found' | 'not_pushed' | 'not_app_order' | 'duplicate' }
  | { outcome: CustomerPushOutcome; status: AppPushedStatus; devices: number }

export async function runCustomerOrderPush(orderId: string, deps: CustomerOrderPushDeps): Promise<CustomerOrderPushResult> {
  const order = await deps.readOrder(orderId)
  if (!order) return { outcome: 'not_found' }
  const status = toAppOrderStatus(order.status)
  if (!isPushedStatus(status)) return { outcome: 'not_pushed' }

  const index = await deps.readIndexRow(order.tenantId, order.id)
  if (!index) return { outcome: 'not_app_order' }
  const body = orderPushText(status, index.orderKind, index.number)
  if (!body) return { outcome: 'not_pushed' }

  if (!(await deps.claim({ orderId: order.id, status, tenantId: order.tenantId }))) return { outcome: 'duplicate' }

  const tokens = await deps.readTokens(order.tenantId, index.customerId)
  if (tokens.length === 0) {
    await deps.record({ orderId: order.id, status, outcome: 'no_devices', devices: 0 })
    return { outcome: 'no_devices', status, devices: 0 }
  }

  const storeName = await deps.readStoreName(order.tenantId)
  let accepted = 0
  try {
    accepted = (await deps.send(order.tenantId, buildOrderPushMessages(tokens, { storeName, body, orderId: order.id, status }))).accepted
  } catch (error) {
    console.error('[customer-order-push] send failed', { message: error instanceof Error ? error.message : String(error) })
  }
  const outcome: CustomerPushOutcome = accepted >= tokens.length ? 'sent' : accepted > 0 ? 'partly_sent' : 'send_failed'
  await deps.record({ orderId: order.id, status, outcome, devices: accepted })
  return { outcome, status, devices: accepted }
}

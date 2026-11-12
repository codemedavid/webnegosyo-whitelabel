import { APP_ORDER_PUSH_CHANNEL, APP_PUSHED_STATUSES, type AppOrderKind, type AppOrderPushData, type AppOrderStatus, type AppPushedStatus } from '@/lib/app-contract'

/**
 * What a customer-app order push says (P7; owner, 2026-11-12): Accepted, Ready
 * and Cancelled for every order, Delivered for delivery orders only.
 * Preparing is never pushed (it lands seconds after Accepted on most stores).
 *
 * Lock screens are public: the text names the store and the daily number,
 * never a price, a dish, a name or an address. Pure.
 */

/** A customer keeps at most this many installs per store (same as the SQL). */
export const CUSTOMER_PUSH_INSTALLS_MAX = 5
const TITLE_MAX = 60

/** Orders a rider takes away: their "ready" means waiting for the rider, and only they get Delivered. */
const RIDER_KINDS: ReadonlySet<AppOrderKind> = new Set(['delivery', 'grab', 'foodpanda'])

export function isPushedStatus(status: AppOrderStatus | null): status is AppPushedStatus {
  return status !== null && (APP_PUSHED_STATUSES as readonly string[]).includes(status)
}

/** The push body for this status, or null when this order does not get one. */
export function orderPushText(status: AppOrderStatus, orderKind: AppOrderKind, number: string | null): string | null {
  const label = number ? `Order ${number}` : 'Your order'
  const isRider = RIDER_KINDS.has(orderKind)
  switch (status) {
    case 'confirmed':
      return `${label} was accepted. We’ll let you know when it’s ready.`
    case 'ready':
      if (isRider) return `${label} is packed and waiting for the rider.`
      if (orderKind === 'dine_in') return `${label} is ready and on its way to your table.`
      return `${label} is ready for pickup.`
    case 'delivered':
      return isRider ? `${label} was delivered. Enjoy!` : null
    case 'cancelled':
      return `${label} was cancelled. Open the app for details.`
    default:
      return null
  }
}

export interface CustomerOrderPushMessage {
  to: string
  title: string
  body: string
  data: AppOrderPushData
  sound: 'default'
  channelId: typeof APP_ORDER_PUSH_CHANNEL
  priority: 'high'
}

export function orderPushTitle(storeName: string | null): string {
  const name = storeName?.trim()
  if (!name) return 'Order update'
  return name.length > TITLE_MAX ? `${name.slice(0, TITLE_MAX - 1).trimEnd()}…` : name
}

export function buildOrderPushMessages(
  tokens: readonly string[],
  input: { storeName: string | null; body: string; orderId: string; status: AppPushedStatus },
): CustomerOrderPushMessage[] {
  const title = orderPushTitle(input.storeName)
  return tokens.map((to) => ({
    to,
    title,
    body: input.body,
    data: { kind: 'order', orderId: input.orderId, status: input.status },
    sound: 'default',
    channelId: APP_ORDER_PUSH_CHANNEL,
    priority: 'high',
  }))
}

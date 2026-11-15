/**
 * One order, looked up by its daily number ("order #42 yesterday"), shaped for
 * Owl. Pure. The model gets what was ordered, the money, and the order's own
 * Store Activity history (who rang it up, confirmed, edited, cancelled,
 * marked it paid); never ids, phones, the address or the kitchen notes
 * customers type (they can hold a phone number), and the customer's name only
 * masked and only for callers with `customers`.
 */

import { describeActivity } from '@/lib/activity/describe'
import { formatManilaTime, formatPeso } from '@/lib/activity/format'
import type { StoreActivityEvent } from '@/lib/activity/store-event'
import { SALE_CHANNEL_LABELS, toSaleChannel } from '@/lib/dashboard/sale-record'
import { maskCustomerName, staffLabel } from '@/lib/assistant/insights/customer-label'
import type { ToolResult } from '@/lib/assistant/types'

export const ORDER_ITEM_LIMIT = 40
const TIMELINE_LIMIT = 20

export interface LookedUpOrder {
  id: string
  dailyNumber: number
  orderDate: string | null
  createdAt: string
  status: string | null
  paymentStatus: string | null
  paymentMethod: string | null
  orderType: string | null
  source: string | null
  total: number
  discountTotal: number
  deliveryFee: number
  serviceCharge: number
  amountPaid: number | null
  cancelReason: string | null
  customerName: string | null
  revision: number | null
  scheduledFor: string | null
}

export interface LookedUpItem {
  name: string
  quantity: number
  subtotal: number
  variation: string | null
  addons: readonly string[]
}

export interface OrderLookupInput {
  order: LookedUpOrder
  items: readonly LookedUpItem[]
  /** The order's Store Activity rows, newest first; null when the log could not be read. */
  history: readonly StoreActivityEvent[] | null
  /** Same daily number on other days in the searched range (the number resets daily). */
  otherDays: readonly string[]
  showCustomer: boolean
}

const STATUS_WORDS: Readonly<Record<string, string>> = {
  pending: 'new (waiting)',
  confirmed: 'confirmed',
  preparing: 'preparing',
  ready: 'ready',
  delivered: 'completed',
  cancelled: 'cancelled',
}


function money(value: number): number {
  return Math.round(value * 100) / 100
}

export function orderDisplayNumber(dailyNumber: number): string {
  return `#${String(dailyNumber).padStart(2, '0')}`
}

function placedLabel(order: LookedUpOrder): string {
  return `${order.orderDate ?? order.createdAt.slice(0, 10)} ${formatManilaTime(order.createdAt)}`
}

export function buildOrderLookupResult({ order, items, history, otherDays, showCustomer }: OrderLookupInput): ToolResult {
  const number = orderDisplayNumber(order.dailyNumber)
  const shownItems = items.slice(0, ORDER_ITEM_LIMIT)
  const timeline = (history ?? [])
    .slice(0, TIMELINE_LIMIT)
    .reverse()
    .map((event) => {
      const described = describeActivity(event)
      return {
        at: formatManilaTime(event.occurredAt),
        who: event.actorUserId ? staffLabel(event.actorName ?? 'Staff member') : (event.actorName ? staffLabel(event.actorName) : 'Online / system'),
        what: described.title,
        ...(described.subtitle ? { detail: described.subtitle } : {}),
      }
    })
  const status = order.status ? (STATUS_WORDS[order.status] ?? order.status) : null

  return {
    facts: {
      order: number,
      placed: placedLabel(order),
      status,
      orderType: order.orderType,
      channel: SALE_CHANNEL_LABELS[toSaleChannel(order.source)],
      ...(order.scheduledFor ? { scheduledFor: order.scheduledFor } : {}),
      ...(showCustomer ? { customer: maskCustomerName(order.customerName) } : {}),
      total: money(order.total),
      ...(order.discountTotal > 0 ? { discount: money(order.discountTotal) } : {}),
      ...(order.deliveryFee > 0 ? { deliveryFee: money(order.deliveryFee) } : {}),
      ...(order.serviceCharge > 0 ? { serviceCharge: money(order.serviceCharge) } : {}),
      payment: { method: order.paymentMethod, status: order.paymentStatus, ...(order.amountPaid !== null ? { paid: money(order.amountPaid) } : {}) },
      ...(order.cancelReason ? { cancelReason: order.cancelReason } : {}),
      ...(order.revision !== null && order.revision > 1 ? { edited: `${order.revision - 1} time(s)` } : {}),
      items: shownItems.map((item) => ({
        name: item.name,
        qty: item.quantity,
        subtotal: money(item.subtotal),
        ...(item.variation ? { choice: item.variation } : {}),
        ...(item.addons.length > 0 ? { addons: item.addons.slice(0, 6) } : {}),
      })),
      ...(items.length > shownItems.length ? { moreItems: items.length - shownItems.length } : {}),
      history: history === null ? 'The activity log could not be read.' : timeline,
      ...(otherDays.length > 0 ? { sameNumberAlsoOn: otherDays } : {}),
    },
    card: {
      type: 'ranked',
      title: `Order ${number}`,
      subtitle: [placedLabel(order), status, formatPeso(order.total)].filter(Boolean).join(' · '),
      rows: [
        ...shownItems.map((item) => ({
          label: `${item.quantity}× ${item.name}`,
          value: formatPeso(item.subtotal),
          ...(item.variation ? { detail: item.variation } : {}),
        })),
        ...timeline.map((step) => ({ label: step.what, value: step.at, ...(step.detail ? { detail: step.detail } : {}), badge: 'Log' })),
      ],
      emptyText: 'No items recorded on this order.',
    },
    links: [{ label: 'Open Orders', path: '/orders' }],
  }
}

/**
 * One row of the web Orders table, whichever backend the order came from.
 *
 * Platform rows (snake_case, with `order_items`) and Convex documents
 * (camelCase, `itemCount` only) are mapped onto the same shape here, so the
 * table component never branches on the backend and both kinds of store get
 * the same columns, words and colours.
 *
 * Pure: no I/O. `getOrderScheduledLabel` formats a stored ISO and does not
 * read the clock.
 */

import { formatDailyOrderNumber } from '@/lib/order-number'
import { displayCustomerName } from '@/lib/order-display-name'
import { getOrderScheduledLabel } from '@/lib/advance-order-utils'
import { getOrderOutletId, getOrderOutletLabel } from '@/lib/outlets/order-outlet-display'
import { getOrderTableNumber } from '@/lib/order-table-number'
import { readOrderDiscount } from '@/lib/order-discount'
import type { OrderWithItems } from '@/lib/orders-service'
import { toOrderStatus, type OrderStatus } from './status'

/** How the order reaches the customer; drives the icon only. */
export type OrderKind = 'dine_in' | 'pickup' | 'delivery' | 'other'

/**
 * The payment cell.
 *
 * - `paid`: the order says paid or verified.
 * - `proof`: the customer sent a payment screenshot or reference that nobody
 *   has marked paid yet.
 * - `unpaid`: still owed on an order that is still open.
 * - `failed`: marked failed on an open order.
 * - `none`: nothing to say — cancelled, no payment status at all (a backend
 *   that keeps none), or handed over without a recorded payment. The merchant
 *   app reads a handed-over order as settled (`isOrderUnpaid`); the web shows
 *   no chip rather than claiming either way.
 *
 * `paymentFilterOf` in the reader applies the SAME rules in SQL, so the
 * "Not paid" filter and the "Not paid" chip always pick the same orders.
 */
export type PaymentChip = 'paid' | 'proof' | 'unpaid' | 'failed' | 'none'

export const PAYMENT_CHIP_LABELS: Readonly<Record<PaymentChip, string>> = {
  paid: 'Paid',
  proof: 'Check proof',
  unpaid: 'Not paid',
  failed: 'Failed',
  none: '—',
}

export type OrderSource = 'pos' | 'web' | 'mobile'

export interface OrdersTableRow {
  id: string
  /** "#007", or the short id for an order without a daily number. */
  numberLabel: string
  createdAtMs: number
  status: OrderStatus
  customerName: string
  customerContact: string | null
  typeLabel: string | null
  kind: OrderKind | null
  tableNumber: string | null
  outletLabel: string | null
  scheduledLabel: string | null
  /** "2× Burger, Fries" — empty when the backend sends no item names. */
  itemsText: string
  /** Lines left out of `itemsText`. */
  moreItems: number
  itemCount: number
  total: number
  /** What a voucher or discount took off; 0 when none. */
  discountTotal: number
  payment: PaymentChip
  paymentMethod: string | null
  source: OrderSource | null
}

const SETTLED = new Set(['paid', 'verified'])

export interface PaymentChipInput {
  status: OrderStatus
  paymentStatus: string | null | undefined
  hasProof: boolean
}

export function paymentChipOf({ status, paymentStatus, hasProof }: PaymentChipInput): PaymentChip {
  if (status === 'cancelled') return 'none'
  if (paymentStatus && SETTLED.has(paymentStatus)) return 'paid'
  if (paymentStatus == null) return 'none'
  if (hasProof) return 'proof'
  if (status === 'delivered') return 'none'
  return paymentStatus === 'failed' ? 'failed' : 'unpaid'
}

const KIND_BY_TYPE: Readonly<Record<string, OrderKind>> = {
  dine_in: 'dine_in',
  pickup: 'pickup',
  delivery: 'delivery',
}

/**
 * The kind of an order type. The store's own `order_types.type` wins (types
 * are renamed freely: "Padala" is a delivery); the stored label is only read
 * when the type row is unknown.
 */
export function orderKindOf(typeLabel: string | null | undefined, storedType?: string | null): OrderKind | null {
  if (storedType) return KIND_BY_TYPE[storedType] ?? 'other'
  if (!typeLabel) return null
  const folded = typeLabel.toLowerCase().replace(/[\s_-]+/g, '')
  if (folded.includes('dinein')) return 'dine_in'
  if (folded.includes('pickup') || folded.includes('takeout') || folded.includes('takeaway')) return 'pickup'
  if (folded.includes('deliver')) return 'delivery'
  return 'other'
}

interface NamedLine {
  menu_item_name: string
  quantity: number
}

/** "2× Burger, Fries" plus how many lines did not fit. */
export function itemsSummary(lines: readonly NamedLine[], maxLines = 2): { text: string; more: number } {
  const shown = lines.slice(0, maxLines).map((line) => {
    const name = (line.menu_item_name ?? '').trim() || 'Item'
    return line.quantity > 1 ? `${line.quantity}× ${name}` : name
  })
  return { text: shown.join(', '), more: Math.max(0, lines.length - maxLines) }
}

function toSource(value: unknown): OrderSource | null {
  return value === 'pos' || value === 'web' || value === 'mobile' ? value : null
}

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

export interface PlatformRowContext {
  /** order_types.id → order_types.type, for the kind icon. */
  typeKinds?: Readonly<Record<string, string>>
  /** outlets.id → name, for orders whose snapshot carries no branch name. */
  outletNames?: Readonly<Record<string, string>>
}

export function platformOrderRow(order: OrderWithItems, context: PlatformRowContext = {}): OrdersTableRow {
  const status = toOrderStatus(order.status)
  const items = order.order_items ?? []
  const summary = itemsSummary(items)
  const outletId = getOrderOutletId(order)
  const storedType = order.order_type_id ? context.typeKinds?.[order.order_type_id] : undefined
  return {
    id: order.id,
    numberLabel: formatDailyOrderNumber(order.daily_number ?? order.daily_order_number, order.id),
    createdAtMs: Date.parse(order.created_at),
    status,
    customerName: displayCustomerName(order.customer_name),
    customerContact: nonEmpty(order.customer_contact),
    typeLabel: nonEmpty(order.order_type),
    kind: orderKindOf(order.order_type, storedType),
    tableNumber: getOrderTableNumber(order.customer_data),
    outletLabel: getOrderOutletLabel(order) ?? (outletId ? context.outletNames?.[outletId] ?? null : null),
    scheduledLabel: getOrderScheduledLabel(order),
    itemsText: summary.text,
    moreItems: summary.more,
    itemCount: items.reduce((sum, item) => sum + toNumber(item.quantity), 0),
    total: toNumber(order.total),
    discountTotal: readOrderDiscount(order)?.total ?? 0,
    payment: paymentChipOf({
      status,
      paymentStatus: order.payment_status,
      hasProof: Boolean(order.payment_proof_uploaded_at || order.payment_proof_url || order.payment_proof_reference),
    }),
    paymentMethod: nonEmpty(order.payment_method_name),
    source: toSource((order as { source?: unknown }).source),
  }
}

/**
 * A Convex `orders:getOrders` document. Convex keeps no item names on the
 * order (only `itemCount`) and no payment proof, so those cells say less.
 */
export function convexOrderRow(doc: Record<string, unknown>): OrdersTableRow {
  const status = toOrderStatus(doc.status)
  const customerData = (doc.customerData ?? null) as Record<string, unknown> | null
  const id = String(doc._id ?? '')
  const dailyNumber = typeof doc.dailyNumber === 'number' ? doc.dailyNumber : null
  const typeLabel = nonEmpty(doc.orderType)
  return {
    id,
    numberLabel: formatDailyOrderNumber(dailyNumber, id),
    createdAtMs: toNumber(doc._creationTime),
    status,
    customerName: displayCustomerName(doc.customerName as string | undefined),
    customerContact: nonEmpty(doc.customerContact),
    typeLabel,
    kind: orderKindOf(typeLabel),
    tableNumber: getOrderTableNumber(customerData),
    outletLabel: getOrderOutletLabel({ customerData }),
    scheduledLabel: getOrderScheduledLabel({
      scheduled_for: (doc.scheduledFor ?? null) as string | null,
      customer_data: customerData,
    }),
    itemsText: '',
    moreItems: 0,
    itemCount: toNumber(doc.itemCount),
    total: toNumber(doc.total),
    discountTotal: readOrderDiscount(doc)?.total ?? 0,
    payment: paymentChipOf({
      status,
      paymentStatus: typeof doc.paymentStatus === 'string' ? doc.paymentStatus : null,
      hasProof: false,
    }),
    paymentMethod: nonEmpty(doc.paymentMethod),
    source: toSource(doc.source),
  }
}

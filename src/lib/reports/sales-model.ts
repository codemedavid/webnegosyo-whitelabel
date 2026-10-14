/**
 * The one definition of the sales numbers (plan §5, the metric dictionary).
 * Every report screen, every export and (later) the merchant app read their
 * figures from here. Nothing else defines "net sales".
 *
 * Per live order, in centavos:
 *   gross      = billed − service − delivery (net of its discount) + food discount
 *   net        = gross − food discount                    ← the headline "Sales"
 *   billed     = the order's own total = net + service + delivery
 *
 * The order TOTAL is the authority, because it is what the customer was asked
 * to pay. Gross is derived from it rather than summed from the lines: in live
 * data 99.9% of orders agree, and the rest are edited orders whose lines or
 * service charge went stale. Those are scaled to the bill and disclosed in
 * `coverage`, so items, categories and the total can never disagree.
 *
 * Paid (shared with the merchant app's `order-paid-state.ts`): an order is
 * settled when its status is paid/verified, when it was handed over (delivered
 * and not a table's tab), or when the ledger covers it. Collected money is the
 * ledger; a settled order with a short (or no) ledger is collected in full.
 * Money beyond what is owed is "overpaid" (a refund is due), never extra sales.
 *
 * A ledger `refund` is change handed back after an edit LOWERED the bill
 * (`webnegosyo-app/lib/order-balance.ts`): the order's total already carries
 * the reduction, so the refund settles the ledger and is NOT taken off sales a
 * second time (it is reported as money returned). Sales returned after the
 * fact are the refunds ledger's business (store-activity's `order_refunds`).
 */

import { REVERSED_STATUSES } from '@/lib/customer-order-facts'
import type { OrderDiscountPayload } from '@/lib/order-discount'
import type { SaleChannel } from '@/lib/dashboard/sale-record'
import { splitOrderDiscount, type DiscountKind, DISCOUNT_KINDS } from './discount-allocation'
import { allocateCents, sumCents, toCents } from './money'

type Money = number | string | null

export interface ReportPayment {
  /** `charge` or `refund` (the `order_payments` kinds). */
  kind: string
  amount: Money
  methodId: string | null
  methodName: string | null
  /** When the money moved, epoch ms. */
  at: number
}

export interface ReportLine {
  id: string
  menuItemId: string | null
  name: string
  /** The category it was sold under (snapshot); null when unknown. */
  categoryName: string | null
  quantity: number
  /** Line total, modifiers and add-ons included, before any order discount. */
  subtotal: Money
}

/** A storage-neutral order, as every backend's reader projects it. */
export interface ReportOrder {
  id: string
  /** When the order was placed (platform: `created_at`), epoch ms. */
  at: number
  status: string
  paymentStatus: string | null
  channel: SaleChannel
  orderType: string
  outletId: string | null
  /** A dine-in tab: handing it over does not mean it was paid. */
  hasTable: boolean
  total: Money
  serviceCharge: Money
  deliveryFee: Money
  discount: OrderDiscountPayload | null
  /** The method picked at checkout. */
  methodId: string | null
  methodName: string | null
  /** The settlement ledger. Empty = nothing recorded. */
  payments: readonly ReportPayment[]
  /** Empty = the lines were not recorded. */
  lines: readonly ReportLine[]
}

export interface OrderFigures {
  isLive: boolean
  isSettled: boolean
  billedCents: number
  grossCents: number
  /** Off the food. */
  discountCents: number
  /** Off the delivery fee (already taken out of `deliveryCents`). */
  deliveryDiscountCents: number
  discountByKind: Readonly<Record<DiscountKind, number>>
  /** Money handed back through the ledger (settlement, not a cut to sales). */
  refundCents: number
  netCents: number
  serviceCents: number
  /** The delivery fee the customer paid, after any delivery discount. */
  deliveryCents: number
  collectedCents: number
  unpaidCents: number
  overpaidCents: number
  /** Σ line subtotals − gross; null when no lines were recorded. */
  lineGapCents: number | null
}

/** Settled payment states: money in hand (`verified` = an approved proof). */
const SETTLED_PAYMENT_STATUSES: ReadonlySet<string> = new Set(['paid', 'verified'])

function lower(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

export function isLiveOrder(order: Pick<ReportOrder, 'status' | 'total'>): boolean {
  return !REVERSED_STATUSES.has(lower(order.status)) && toCents(order.total) >= 0
}

/**
 * The app's `isOrderUnpaid` rule: a paid/verified status, a handed-over
 * non-table order, or NO status at all (a backend with nothing to say about
 * payment must not be shown as owing).
 */
export function isSettledByStatus(order: Pick<ReportOrder, 'status' | 'paymentStatus' | 'hasTable'>): boolean {
  if (order.paymentStatus == null) return true
  if (SETTLED_PAYMENT_STATUSES.has(lower(order.paymentStatus))) return true
  return lower(order.status) === 'delivered' && !order.hasTable
}

export function ledgerTotals(payments: readonly ReportPayment[]): { chargeCents: number; refundCents: number } {
  return payments.reduce(
    (acc, payment) => {
      const cents = toCents(payment.amount)
      return lower(payment.kind) === 'refund'
        ? { ...acc, refundCents: acc.refundCents + cents }
        : { ...acc, chargeCents: acc.chargeCents + cents }
    },
    { chargeCents: 0, refundCents: 0 },
  )
}

function emptyKinds(): Record<DiscountKind, number> {
  return Object.fromEntries(DISCOUNT_KINDS.map((kind) => [kind, 0])) as Record<DiscountKind, number>
}

export function orderFigures(order: ReportOrder): OrderFigures {
  const billedCents = toCents(order.total)
  const serviceCents = toCents(order.serviceCharge)
  const deliveryFeeCents = Math.max(0, toCents(order.deliveryFee))
  const discount = splitOrderDiscount(order.discount, deliveryFeeCents)
  const deliveryCents = deliveryFeeCents - discount.deliveryCents
  const grossCents = billedCents - serviceCents - deliveryCents + discount.foodCents

  const { chargeCents, refundCents } = ledgerTotals(order.payments)
  const ledgerNetCents = chargeCents - refundCents
  const isSettled = isSettledByStatus(order) || ledgerNetCents >= billedCents
  const collectedCents = isSettled ? Math.max(ledgerNetCents, billedCents) : ledgerNetCents

  const lineCents = order.lines.map((line) => toCents(line.subtotal))
  return {
    isLive: isLiveOrder(order),
    isSettled,
    billedCents,
    grossCents,
    discountCents: discount.foodCents,
    deliveryDiscountCents: discount.deliveryCents,
    discountByKind: discount.byKind,
    refundCents,
    netCents: grossCents - discount.foodCents,
    serviceCents,
    deliveryCents,
    collectedCents,
    unpaidCents: Math.max(0, billedCents - collectedCents),
    overpaidCents: Math.max(0, collectedCents - billedCents),
    lineGapCents: order.lines.length === 0 ? null : sumCents(lineCents) - grossCents,
  }
}

export interface LineFigures {
  orderId: string
  /** Null for the stand-in line of an order whose lines were not recorded. */
  lineId: string | null
  menuItemId: string | null
  name: string
  categoryName: string | null
  quantity: number
  isUnrecorded: boolean
  grossCents: number
  discountCents: number
  netCents: number
}

export const UNRECORDED_LINE_NAME = 'Items not recorded'

/**
 * A live order's lines with its gross and discount shared across them by
 * value (largest remainder), so they add up to the order exactly.
 */
export function orderLineFigures(order: ReportOrder, figures: OrderFigures = orderFigures(order)): LineFigures[] {
  if (!figures.isLive) return []
  const lines: readonly ReportLine[] =
    order.lines.length > 0
      ? order.lines
      : [{ id: '', menuItemId: null, name: UNRECORDED_LINE_NAME, categoryName: null, quantity: 0, subtotal: 0 }]
  const isUnrecorded = order.lines.length === 0

  const gross = allocateCents(figures.grossCents, lines.map((line) => toCents(line.subtotal)))
  const discounts = allocateCents(figures.discountCents, gross)

  return lines.map((line, i) => ({
    orderId: order.id,
    lineId: isUnrecorded ? null : line.id,
    menuItemId: line.menuItemId,
    name: line.name,
    categoryName: line.categoryName,
    quantity: line.quantity,
    isUnrecorded,
    grossCents: gross[i],
    discountCents: discounts[i],
    netCents: gross[i] - discounts[i],
  }))
}

export interface SalesSummary {
  orders: number
  grossCents: number
  discountCents: number
  deliveryDiscountCents: number
  /** Food and delivery discounts, by kind. */
  discountByKind: Readonly<Record<DiscountKind, number>>
  /** Money handed back through the ledger; already inside `collectedCents`. */
  refundCents: number
  netCents: number
  serviceCents: number
  deliveryCents: number
  billedCents: number
  collectedCents: number
  unpaidCents: number
  overpaidCents: number
  /** Net per order; null with no orders. */
  aovCents: number | null
  voids: { orders: number; billedCents: number }
  coverage: { ordersWithoutLines: number; ordersLinesMismatch: number; lineGapCents: number }
}

type Additive = Omit<SalesSummary, 'aovCents' | 'voids' | 'coverage' | 'discountByKind'>
const ADDITIVE_KEYS = [
  'grossCents',
  'discountCents',
  'deliveryDiscountCents',
  'refundCents',
  'netCents',
  'serviceCents',
  'deliveryCents',
  'billedCents',
  'collectedCents',
  'unpaidCents',
  'overpaidCents',
] as const satisfies readonly (keyof Additive)[]

function addFigures(acc: SalesSummary, figures: OrderFigures): SalesSummary {
  const sums = Object.fromEntries(ADDITIVE_KEYS.map((key) => [key, acc[key] + figures[key]])) as Pick<
    SalesSummary,
    (typeof ADDITIVE_KEYS)[number]
  >
  const gap = figures.lineGapCents
  return {
    ...acc,
    ...sums,
    orders: acc.orders + 1,
    discountByKind: Object.fromEntries(
      DISCOUNT_KINDS.map((kind) => [kind, acc.discountByKind[kind] + figures.discountByKind[kind]]),
    ) as Record<DiscountKind, number>,
    coverage: {
      ordersWithoutLines: acc.coverage.ordersWithoutLines + (gap === null ? 1 : 0),
      ordersLinesMismatch: acc.coverage.ordersLinesMismatch + (gap !== null && gap !== 0 ? 1 : 0),
      lineGapCents: acc.coverage.lineGapCents + (gap ?? 0),
    },
  }
}

function emptySummary(): SalesSummary {
  return {
    orders: 0,
    ...(Object.fromEntries(ADDITIVE_KEYS.map((key) => [key, 0])) as Pick<SalesSummary, (typeof ADDITIVE_KEYS)[number]>),
    discountByKind: emptyKinds(),
    aovCents: null,
    voids: { orders: 0, billedCents: 0 },
    coverage: { ordersWithoutLines: 0, ordersLinesMismatch: 0, lineGapCents: 0 },
  }
}

export function summarizeSales(orders: readonly ReportOrder[]): SalesSummary {
  const summary = orders.reduce((acc, order) => {
    const figures = orderFigures(order)
    if (figures.isLive) return addFigures(acc, figures)
    return { ...acc, voids: { orders: acc.voids.orders + 1, billedCents: acc.voids.billedCents + Math.max(0, figures.billedCents) } }
  }, emptySummary())
  // `+ 0` turns Math.round's −0 into 0.
  return { ...summary, aovCents: summary.orders > 0 ? Math.round(summary.netCents / summary.orders) + 0 : null }
}

export interface RollupRow {
  /** Live orders contributing to the row. */
  orders: number
  quantity: number
  grossCents: number
  discountCents: number
  netCents: number
}

function addRow(row: RollupRow | undefined, part: Omit<RollupRow, 'orders'>, isNewOrder: boolean): RollupRow {
  const base = row ?? { orders: 0, quantity: 0, grossCents: 0, discountCents: 0, netCents: 0 }
  return {
    orders: base.orders + (isNewOrder ? 1 : 0),
    quantity: base.quantity + part.quantity,
    grossCents: base.grossCents + part.grossCents,
    discountCents: base.discountCents + part.discountCents,
    netCents: base.netCents + part.netCents,
  }
}

/** Live lines grouped by `keyOf` (item, category …); rows add up to net sales. */
export function rollupLines(orders: readonly ReportOrder[], keyOf: (line: LineFigures) => string): Map<string, RollupRow> {
  const rows = new Map<string, RollupRow>()
  for (const order of orders) {
    const seen = new Set<string>()
    for (const line of orderLineFigures(order)) {
      const key = keyOf(line)
      rows.set(key, addRow(rows.get(key), line, !seen.has(key)))
      seen.add(key)
    }
  }
  return rows
}

/** Live orders grouped by `keyOf` (channel, branch …); rows add up to net sales. */
export function rollupOrders(orders: readonly ReportOrder[], keyOf: (order: ReportOrder) => string): Map<string, RollupRow> {
  const rows = new Map<string, RollupRow>()
  for (const order of orders) {
    const figures = orderFigures(order)
    if (!figures.isLive) continue
    const key = keyOf(order)
    const quantity = order.lines.reduce((sum, line) => sum + line.quantity, 0)
    rows.set(
      key,
      addRow(rows.get(key), { quantity, grossCents: figures.grossCents, discountCents: figures.discountCents, netCents: figures.netCents }, true),
    )
  }
  return rows
}

/** Change against a base period; null ("new") when there is no base to compare with. */
export function growthRatio(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null
  return (current - previous) / previous
}

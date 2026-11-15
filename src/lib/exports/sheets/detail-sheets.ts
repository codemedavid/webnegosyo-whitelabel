/**
 * Sheets with one row per order, dish, payment or customer. Pure.
 *
 * Money comes from the ONE sales definition: each stored order goes through
 * `toReportOrder` → `orderFigures` / `orderLineFigures`, the same code the
 * report engine is checked against, so the Sales column of the Orders sheet
 * and of the Order lines sheet both add up to the Summary's Sales.
 * A cancelled order keeps its row (it happened) with blank sales figures.
 */

import { SALE_CHANNEL_LABELS } from '@/lib/dashboard/sale-record'
import { describeOrderItem } from '@/lib/order-item-display'
import { getOrderTableNumber } from '@/lib/order-table-number'
import { bucketKey } from '@/lib/reports/period'
import { DISCOUNT_KINDS, DISCOUNT_KIND_LABELS } from '@/lib/reports/discount-allocation'
import { toCents } from '@/lib/reports/money'
import { toReportOrder } from '@/lib/reports/read/platform-order-row'
import { orderFigures, orderLineFigures, type OrderFigures, type ReportOrder } from '@/lib/reports/sales-model'
import { manilaDate, manilaDateTime, manilaTime, pesos, text, words } from '../cells'
import type { ExportRow } from '../types'
import type { DetailData, DetailOrderRow, DetailShiftRow } from './detail-data'

interface OrderView {
  row: DetailOrderRow
  order: ReportOrder
  figures: OrderFigures
  at: number
  orderNo: string | null
  businessDay: string
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/** The register stamps who rang an order up in `customer_data.pos.cashierId`; online orders have none. */
export function cashierIdOf(row: Pick<DetailOrderRow, 'source' | 'customer_data'>): string | null {
  if (row.source !== 'pos') return null
  return text(record(record(row.customer_data)?.pos)?.cashierId)
}

function views(data: DetailData): OrderView[] {
  return data.orders.map((row) => {
    const order = toReportOrder(row, data.itemsByOrder.get(row.id) ?? [], data.paymentsByOrder.get(row.id) ?? [])
    return {
      row,
      order,
      figures: orderFigures(order),
      at: order.at,
      orderNo: row.daily_number == null ? null : String(row.daily_number),
      businessDay: bucketKey(order.at, 'day', data.schedule),
    }
  })
}

/**
 * The shift an order was rung up in: the cashier's own, at the order's branch,
 * open when the order was placed (the drawer rule, `belongsToDrawer`).
 */
export function shiftOf(row: DetailOrderRow, at: number, shifts: readonly DetailShiftRow[]): DetailShiftRow | null {
  const cashierId = cashierIdOf(row)
  if (!cashierId) return null
  return (
    shifts.find((shift) => {
      if (shift.staff_user_id !== cashierId || (shift.outlet_id ?? null) !== (row.outlet_id ?? null)) return false
      const opened = Date.parse(shift.opened_at)
      const closed = shift.closed_at ? Date.parse(shift.closed_at) : Number.POSITIVE_INFINITY
      return at >= opened && at < closed
    }) ?? null
  )
}

function shiftLabel(shift: DetailShiftRow): string {
  const opened = Date.parse(shift.opened_at)
  return `${text(shift.drawer_name) ?? 'Shift'} · opened ${manilaDateTime(opened)}`
}

function staffNames(shifts: readonly DetailShiftRow[]): Map<string, string> {
  const names = new Map<string, string>()
  for (const shift of shifts) if (shift.staff_user_id && text(shift.staff_name)) names.set(shift.staff_user_id, shift.staff_name.trim())
  return names
}

function branchName(outletId: string | null, names: ReadonlyMap<string, string>): string | null {
  return outletId ? (names.get(outletId) ?? 'Unknown branch') : null
}

export function orderRows(data: DetailData): ExportRow[] {
  const names = staffNames(data.shifts)
  return views(data).map(({ row, order, figures, at, orderNo, businessDay }) => {
    const cashierId = cashierIdOf(row)
    const shift = shiftOf(row, at, data.shifts)
    const live = figures.isLive
    return {
      order_no: orderNo,
      business_day: businessDay,
      date: manilaDate(at),
      time: manilaTime(at),
      branch: branchName(row.outlet_id, data.outletNames),
      order_type: order.orderType,
      channel: SALE_CHANNEL_LABELS[order.channel],
      status: words(row.status),
      cashier: cashierId ? (names.get(cashierId) ?? null) : null,
      shift: shift ? shiftLabel(shift) : null,
      table: getOrderTableNumber(row.customer_data),
      customer: text(row.customer_name),
      contact: text(row.customer_contact),
      items: row.item_count ?? (data.itemsByOrder.get(row.id)?.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0) ?? null),
      gross: live ? pesos(figures.grossCents) : null,
      discounts: live ? pesos(figures.discountCents) : null,
      net: live ? pesos(figures.netCents) : null,
      service: live ? pesos(figures.serviceCents) : null,
      delivery: live ? pesos(figures.deliveryCents) : null,
      total: pesos(figures.billedCents),
      collected: live ? pesos(figures.collectedCents) : null,
      unpaid: live ? pesos(figures.unpaidCents) : null,
      payment_method: text(row.payment_method_name),
      payment_status: words(row.payment_status),
      cancel_reason: text(row.cancel_reason),
      order_id: row.id,
    }
  })
}

export function orderLineRows(data: DetailData): ExportRow[] {
  return views(data).flatMap(({ row, order, figures, at, orderNo, businessDay }): ExportRow[] => {
    const shared = {
      order_no: orderNo,
      business_day: businessDay,
      date: manilaDate(at),
      time: manilaTime(at),
      status: words(row.status),
      order_id: row.id,
    }
    const stored = data.itemsByOrder.get(row.id) ?? []
    const byLine = new Map(orderLineFigures(order, figures).map((line) => [line.lineId, line]))
    // A live order whose lines were never recorded still carries its sales, on one stand-in line.
    const standIn = byLine.get(null)
    if (stored.length === 0) {
      return standIn
        ? [{ ...shared, item: standIn.name, category: null, choices: null, addons: null, combo: null, quantity: null, unit_price: null, line_total: null, discounts: pesos(standIn.discountCents), net: pesos(standIn.netCents), notes: null }]
        : []
    }
    return stored.map((item) => {
      const view = describeOrderItem({ ...item, quantity: Number(item.quantity ?? 0), subtotal: item.subtotal ?? 0 })
      const line = byLine.get(item.id)
      return {
        ...shared,
        item: text(item.menu_item_name),
        category: text(item.category_name),
        choices: view.choices.map((choice) => choice.label).join(', ') || null,
        addons: view.addons.map((addon) => (addon.quantity > 1 ? `${addon.name} x${addon.quantity}` : addon.name)).join(', ') || null,
        combo: text(item.bundle_name),
        quantity: Number(item.quantity ?? 0),
        unit_price: Number.isFinite(view.unitPrice) ? Math.round(view.unitPrice * 100) / 100 : null,
        line_total: pesos(toCents(item.subtotal)),
        discounts: line ? pesos(line.discountCents) : null,
        net: line ? pesos(line.netCents) : null,
        notes: text(item.special_instructions),
      }
    })
  })
}

export function paymentRows(data: DetailData): ExportRow[] {
  const names = staffNames(data.shifts)
  const rows = views(data).flatMap(({ row, orderNo }) =>
    (data.paymentsByOrder.get(row.id) ?? []).map((payment) => {
      const at = Date.parse(payment.created_at)
      const isRefund = payment.kind.trim().toLowerCase() === 'refund'
      const cents = toCents(payment.amount)
      return {
        at,
        cells: {
          order_no: orderNo,
          date: Number.isNaN(at) ? null : manilaDate(at),
          time: Number.isNaN(at) ? null : manilaTime(at),
          kind: isRefund ? 'Refund' : 'Payment',
          method: text(payment.payment_method_name),
          amount: pesos(isRefund ? -Math.abs(cents) : cents),
          reference: text(payment.reference),
          recorded_by: payment.recorded_by ? (names.get(payment.recorded_by) ?? null) : null,
          note: text(payment.note),
          order_id: row.id,
        } satisfies ExportRow,
      }
    }),
  )
  return rows.sort((a, b) => a.at - b.at).map((entry) => entry.cells)
}

interface CustomerTally {
  name: string | null
  contact: string | null
  customerId: string | null
  orders: number
  netCents: number
  first: number
  last: number
}

function foldKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Who an order belongs to: the customer record, else the contact typed, else the name typed. */
function customerKey(row: DetailOrderRow): string | null {
  if (row.customer_id) return `id:${row.customer_id}`
  const contact = text(row.customer_contact)
  if (contact) return `contact:${foldKey(contact).replace(/[^0-9a-z@.+]/g, '')}`
  const name = text(row.customer_name)
  return name ? `name:${foldKey(name)}` : null
}

export const UNNAMED_CUSTOMER_LABEL = 'No name given'

/** Live orders only, biggest spender first; orders with no name or number share one last row. */
export function customerRows(data: DetailData): ExportRow[] {
  const tallies = new Map<string, CustomerTally>()
  for (const { row, figures, at } of views(data)) {
    if (!figures.isLive) continue
    const key = customerKey(row) ?? 'unnamed'
    const known = row.customer_id ? data.customers.get(row.customer_id) : undefined
    const before = tallies.get(key)
    tallies.set(key, {
      name: before?.name ?? text(known?.name) ?? text(row.customer_name),
      contact: before?.contact ?? text(known?.phone_e164) ?? text(row.customer_contact),
      customerId: row.customer_id,
      orders: (before?.orders ?? 0) + 1,
      netCents: (before?.netCents ?? 0) + figures.netCents,
      first: Math.min(before?.first ?? at, at),
      last: Math.max(before?.last ?? at, at),
    })
  }
  return [...tallies.entries()]
    .sort(([aKey, a], [bKey, b]) => Number(aKey === 'unnamed') - Number(bKey === 'unnamed') || b.netCents - a.netCents || a.first - b.first)
    .map(([key, tally]) => {
      const known = tally.customerId ? data.customers.get(tally.customerId) : undefined
      const firstEver = known?.first_order_at ? Date.parse(known.first_order_at) : Number.NaN
      const kind = key === 'unnamed' || Number.isNaN(firstEver) ? null : firstEver >= data.start && firstEver < data.end ? 'First-timer' : 'Regular'
      return {
        customer: key === 'unnamed' ? UNNAMED_CUSTOMER_LABEL : tally.name,
        contact: key === 'unnamed' ? null : tally.contact,
        kind,
        orders: tally.orders,
        net: pesos(tally.netCents),
        aov: pesos(tally.orders > 0 ? Math.round(tally.netCents / tally.orders) : null),
        first_order: manilaDateTime(tally.first),
        last_order: manilaDateTime(tally.last),
        lifetime_orders: known?.order_count ?? null,
      }
    })
}

/** The vouchers and reasons stored on an order, as one cell: "SAVE50, Birthday treat". */
function discountDetail(order: ReportOrder): string | null {
  const lines = Array.isArray(order.discount?.lines) ? order.discount.lines : []
  const labels = lines.flatMap((line) => {
    const label = text((line as { code?: unknown } | null)?.code) ?? text((line as { label?: unknown } | null)?.label)
    return label ? [label] : []
  })
  return [...new Set(labels)].join(', ') || null
}

/**
 * One row per kind of discount on a live order. The amounts are the sales
 * model's own split (food and delivery fee together), so the column adds up
 * to the model's food discounts plus its delivery discounts.
 */
export function discountRows(data: DetailData): ExportRow[] {
  const names = staffNames(data.shifts)
  return views(data).flatMap(({ row, order, figures, at, orderNo, businessDay }): ExportRow[] => {
    if (!figures.isLive) return []
    const cashierId = cashierIdOf(row)
    const detail = discountDetail(order)
    return DISCOUNT_KINDS.filter((kind) => figures.discountByKind[kind] !== 0).map((kind) => ({
      order_no: orderNo,
      business_day: businessDay,
      date: manilaDate(at),
      time: manilaTime(at),
      branch: branchName(row.outlet_id, data.outletNames),
      cashier: cashierId ? (names.get(cashierId) ?? null) : null,
      kind: DISCOUNT_KIND_LABELS[kind],
      detail,
      amount: pesos(figures.discountByKind[kind]),
      gross: pesos(figures.grossCents),
      order_id: row.id,
    }))
  })
}

/** Orders that do not count as sales any more. They happened, so they are listed with what they were. */
export function cancelledRows(data: DetailData): ExportRow[] {
  const names = staffNames(data.shifts)
  return views(data).flatMap(({ row, order, figures, at, orderNo, businessDay }): ExportRow[] => {
    if (figures.isLive) return []
    const cashierId = cashierIdOf(row)
    return [
      {
        order_no: orderNo,
        business_day: businessDay,
        date: manilaDate(at),
        time: manilaTime(at),
        branch: branchName(row.outlet_id, data.outletNames),
        order_type: order.orderType,
        channel: SALE_CHANNEL_LABELS[order.channel],
        cashier: cashierId ? (names.get(cashierId) ?? null) : null,
        customer: text(row.customer_name),
        items: row.item_count ?? null,
        total: pesos(figures.billedCents),
        refunded: figures.refundCents ? pesos(figures.refundCents) : null,
        cancel_reason: text(row.cancel_reason),
        order_id: row.id,
      },
    ]
  })
}

export const NO_CASHIER_LABEL = 'Online and other orders (no cashier)'
export const UNKNOWN_CASHIER_LABEL = 'Register (cashier not on a shift)'

interface CashierTally {
  label: string
  orders: number
  grossCents: number
  discountCents: number
  netCents: number
  collectedCents: number
  unpaidCents: number
  cancelled: number
}

/**
 * Every order lands on exactly one row, so Sales adds up to the Summary's.
 * A register order whose cashier has no shift on record (so no name) is kept
 * apart from online orders, which have no cashier at all.
 */
export function cashierRows(data: DetailData): ExportRow[] {
  const names = staffNames(data.shifts)
  const tallies = new Map<string, CashierTally>()
  for (const { row, figures } of views(data)) {
    const cashierId = cashierIdOf(row)
    const name = cashierId ? names.get(cashierId) : undefined
    const key = cashierId ? (name ? `id:${cashierId}` : 'unknown') : 'none'
    const label = cashierId ? (name ?? UNKNOWN_CASHIER_LABEL) : NO_CASHIER_LABEL
    const tally = tallies.get(key) ?? { label, orders: 0, grossCents: 0, discountCents: 0, netCents: 0, collectedCents: 0, unpaidCents: 0, cancelled: 0 }
    if (figures.isLive) {
      tally.orders += 1
      tally.grossCents += figures.grossCents
      tally.discountCents += figures.discountCents
      tally.netCents += figures.netCents
      tally.collectedCents += figures.collectedCents
      tally.unpaidCents += figures.unpaidCents
    } else {
      tally.cancelled += 1
    }
    tallies.set(key, tally)
  }
  const totalNet = [...tallies.values()].reduce((sum, tally) => sum + tally.netCents, 0)
  return [...tallies.entries()]
    .sort(([aKey, a], [bKey, b]) => Number(aKey === 'none') - Number(bKey === 'none') || b.netCents - a.netCents || a.label.localeCompare(b.label))
    .map(([, tally]) => ({
      cashier: tally.label,
      orders: tally.orders,
      gross: pesos(tally.grossCents),
      discounts: pesos(tally.discountCents),
      net: pesos(tally.netCents),
      aov: tally.orders > 0 ? pesos(Math.round(tally.netCents / tally.orders)) : null,
      collected: pesos(tally.collectedCents),
      unpaid: pesos(tally.unpaidCents),
      cancelled: tally.cancelled,
      share: totalNet > 0 ? tally.netCents / totalNet : null,
    }))
}

/**
 * Platform Supabase rows → the storage-neutral report order (sales-model).
 *
 * Pure, so the mapping is tested without a database and the Phase 1 reader
 * only fetches. The discount is read with `readOrderDiscount`, the same reader
 * every receipt uses (column first, then the POS blob).
 */

import { toOrderTypeLabel, toSaleChannel } from '@/lib/dashboard/sale-record'
import { readOrderDiscount } from '@/lib/order-discount'
import { getOrderTableNumber } from '@/lib/order-table-number'
import type { ReportLine, ReportOrder, ReportPayment } from '../sales-model'

type Numeric = number | string | null

export interface PlatformOrderRow {
  id: string
  created_at: string
  status: string | null
  payment_status: string | null
  source: string | null
  order_type: string | null
  outlet_id: string | null
  total: Numeric
  service_charge_amount: Numeric
  delivery_fee: Numeric
  discount_data: unknown
  customer_data: unknown
  payment_method_id: string | null
  payment_method_name: string | null
}

export interface PlatformOrderItemRow {
  id: string
  order_id: string
  menu_item_id: string | null
  menu_item_name: string | null
  category_name: string | null
  quantity: number | null
  subtotal: Numeric
}

export interface PlatformPaymentRow {
  order_id: string
  kind: string
  amount: Numeric
  payment_method_id: string | null
  payment_method_name: string | null
  created_at: string
}

/** Columns each mapper reads, for the reader's `select`. */
export const REPORT_ORDER_COLUMNS =
  'id, created_at, status, payment_status, source, order_type, outlet_id, total, service_charge_amount, delivery_fee, discount_data, customer_data, payment_method_id, payment_method_name'
export const REPORT_ITEM_COLUMNS = 'id, order_id, menu_item_id, menu_item_name, category_name, quantity, subtotal'
export const REPORT_PAYMENT_COLUMNS = 'order_id, kind, amount, payment_method_id, payment_method_name, created_at'

function instant(iso: string, what: string): number {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) throw new Error(`${what} has an unreadable date: ${iso}`)
  return ms
}

function toLine(row: PlatformOrderItemRow): ReportLine {
  return {
    id: row.id,
    menuItemId: row.menu_item_id,
    name: row.menu_item_name ?? '',
    categoryName: row.category_name?.trim() || null,
    quantity: Number(row.quantity ?? 0),
    subtotal: row.subtotal,
  }
}

function toPayment(row: PlatformPaymentRow): ReportPayment {
  return {
    kind: row.kind,
    amount: row.amount,
    methodId: row.payment_method_id,
    methodName: row.payment_method_name,
    at: instant(row.created_at, `A payment on order ${row.order_id}`),
  }
}

export function toReportOrder(
  row: PlatformOrderRow,
  items: readonly PlatformOrderItemRow[],
  payments: readonly PlatformPaymentRow[],
): ReportOrder {
  return {
    id: row.id,
    at: instant(row.created_at, `Order ${row.id}`),
    status: row.status ?? '',
    paymentStatus: row.payment_status,
    channel: toSaleChannel(row.source),
    orderType: toOrderTypeLabel(row.order_type),
    outletId: row.outlet_id,
    hasTable: getOrderTableNumber(row.customer_data) !== null,
    total: row.total,
    serviceCharge: row.service_charge_amount,
    deliveryFee: row.delivery_fee,
    discount: readOrderDiscount(row),
    methodId: row.payment_method_id,
    methodName: row.payment_method_name,
    payments: payments.map(toPayment),
    lines: items.map(toLine),
  }
}

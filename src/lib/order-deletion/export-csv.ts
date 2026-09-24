/**
 * The backup file an owner must download before anything is deleted.
 *
 * One row per order, its lines summarised in one cell, times in Manila. After
 * the recovery window this file is the only copy left, so it carries every
 * money column and the order id. Cells go through the shared CSV writer, which
 * defuses anything a customer typed that a spreadsheet would run as a formula.
 */
import { toCsv, type CsvCell } from '@/lib/inventory/import/csv'
import { MANILA_OFFSET_HOURS } from './constants'
import type { ExportItem, ExportOrder } from './types'

const BYTE_ORDER_MARK = '﻿'

const HEADER = [
  'Order #',
  'Date (Manila)',
  'Status',
  'Payment status',
  'Payment method',
  'Order type',
  'Branch',
  'Customer',
  'Contact',
  'Items',
  'Delivery fee',
  'Service charge',
  'Discount',
  'Total',
  'Amount paid',
  'Source',
  'Order ID',
] as const

/** `2026-09-01T02:30:00Z` → `2026-09-01 10:30` (Manila). */
function manilaDateTime(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + MANILA_OFFSET_HOURS * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 16).replace('T', ' ')
}

function describeItem(item: ExportItem): string {
  const variation = item.variation ? ` (${item.variation})` : ''
  const addons = item.addons && item.addons.length > 0 ? ` + ${item.addons.join(', ')}` : ''
  const note = item.special_instructions ? ` [${item.special_instructions}]` : ''
  return `${item.quantity}× ${item.menu_item_name}${variation}${addons}${note}`
}

function groupItems(items: readonly ExportItem[]): Map<string, string> {
  const grouped = new Map<string, string[]>()
  for (const item of items) {
    grouped.set(item.order_id, [...(grouped.get(item.order_id) ?? []), describeItem(item)])
  }
  return new Map([...grouped].map(([orderId, lines]) => [orderId, lines.join('; ')]))
}

function orderRow(order: ExportOrder, items: string, branch: string): CsvCell[] {
  return [
    order.daily_number,
    manilaDateTime(order.created_at),
    order.status,
    order.payment_status,
    order.payment_method_name,
    order.order_type,
    branch,
    order.customer_name,
    order.customer_contact,
    items,
    order.delivery_fee,
    order.service_charge_amount,
    order.discount_total,
    order.total,
    order.amount_paid,
    order.source,
    order.id,
  ]
}

export function buildOrderExportCsv(
  orders: readonly ExportOrder[],
  items: readonly ExportItem[],
  outletNames: ReadonlyMap<string, string>
): string {
  const itemsByOrder = groupItems(items)
  const rows = orders.map((order) =>
    orderRow(
      order,
      itemsByOrder.get(order.id) ?? '',
      order.outlet_id ? outletNames.get(order.outlet_id) ?? '' : ''
    )
  )
  return BYTE_ORDER_MARK + toCsv([[...HEADER], ...rows])
}

/** `aling-nena-orders-backup-2026-09-24.csv`; the slug is reduced to safe characters. */
export function exportFileName(tenantSlug: string, now: Date): string {
  const safeSlug = tenantSlug.replace(/[^a-z0-9-]/gi, '').replace(/^-+|-+$/g, '') || 'store'
  const day = new Date(now.getTime() + MANILA_OFFSET_HOURS * 60 * 60 * 1000).toISOString().slice(0, 10)
  return `${safeSlug}-orders-backup-${day}.csv`
}

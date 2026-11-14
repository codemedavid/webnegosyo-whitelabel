/**
 * The export catalogue: every sheet a store can download (plan 2026-11-14 §4).
 *
 * ONE list. The Export page draws its cards from it, the Export button on a
 * report asks for a sheet by id, and Owl's tools take these ids as their
 * enum. Ids (sheets AND columns) are stored in saved formats and Owl specs:
 * never rename one. A new sheet = an entry here + a builder in `sheets/`
 * (the contract test fails otherwise).
 */

import type { StaffPermissionKey } from '@/lib/staff-permissions'
import type { ReportSection } from '@/lib/reports/api/query-schema'
import type { ExportAccess, ExportColumn } from './types'

export const SHEET_IDS = [
  'summary',
  'sales_by_day',
  'items',
  'categories',
  'order_types',
  'channels',
  'branches',
  'payments_by_method',
  'orders',
  'order_lines',
  'payments_received',
  'customers',
  'discounts',
  'cancelled',
  'sales_by_cashier',
] as const
export type SheetId = (typeof SHEET_IDS)[number]

export const SHEET_GROUPS = ['sales', 'orders', 'customers', 'staff'] as const
export type SheetGroup = (typeof SHEET_GROUPS)[number]

export const SHEET_GROUP_LABELS: Readonly<Record<SheetGroup, string>> = {
  sales: 'Sales',
  orders: 'Orders',
  customers: 'Customers',
  staff: 'Staff and cash',
}

/**
 * `summary` sheets are totals from the report engine (up to 13 months).
 * `detail` sheets are one row per order / dish / payment, read row by row,
 * so they take a shorter range and a row cap.
 */
export type SheetSource = 'summary' | 'detail'

export interface SheetDef {
  id: SheetId
  /** Also the Excel tab name: ≤ 31 characters, none of \ / ? * [ ] : */
  name: string
  group: SheetGroup
  /** Finishes the sentence "One row is …" on the Export page. */
  rowIs: string
  source: SheetSource
  /** Every key listed is needed. The Export page itself already needs `reports`. */
  needs: readonly StaffPermissionKey[]
  /** Summary sheets: the engine sections the builder reads. */
  sections: readonly ReportSection[]
  /** Multi-branch stores only (a single-branch store would get one row). */
  multiBranchOnly?: boolean
  columns: readonly ExportColumn[]
}

const BREAKDOWN_COLUMNS: readonly ExportColumn[] = [
  { id: 'orders', header: 'Orders', kind: 'count' },
  { id: 'quantity', header: 'Items sold', kind: 'count' },
  { id: 'gross', header: 'Sales before discounts', kind: 'money' },
  { id: 'discounts', header: 'Discounts', kind: 'money' },
  { id: 'net', header: 'Sales', kind: 'money' },
  { id: 'share', header: 'Share of sales', kind: 'percent' },
]

function breakdown(id: SheetId, name: string, first: string, rowIs: string, section: ReportSection, extra: Partial<SheetDef> = {}): SheetDef {
  return {
    id,
    name,
    group: 'sales',
    rowIs,
    source: 'summary',
    needs: ['reports'],
    sections: [section],
    columns: [{ id: 'name', header: first, kind: 'text' }, ...BREAKDOWN_COLUMNS],
    ...extra,
  }
}

const SHEET_LIST: readonly SheetDef[] = [
  {
    id: 'summary',
    name: 'Summary',
    group: 'sales',
    rowIs: 'one total for the whole period: sales, discounts, money received, still to collect',
    source: 'summary',
    needs: ['reports'],
    sections: ['summary', 'periods', 'items', 'payments'],
    columns: [
      { id: 'line', header: 'Line', kind: 'text' },
      { id: 'value', header: 'Amount', kind: 'money' },
      { id: 'note', header: 'Note', kind: 'text' },
    ],
  },
  {
    id: 'sales_by_day',
    name: 'Sales by day',
    group: 'sales',
    rowIs: 'one business day: orders, sales, discounts, average order, money received',
    source: 'summary',
    needs: ['reports'],
    sections: ['periods'],
    columns: [
      { id: 'day', header: 'Day', kind: 'text' },
      { id: 'weekday', header: 'Weekday', kind: 'text' },
      { id: 'orders', header: 'Orders', kind: 'count' },
      { id: 'gross', header: 'Sales before discounts', kind: 'money' },
      { id: 'discounts', header: 'Discounts', kind: 'money' },
      { id: 'net', header: 'Sales', kind: 'money' },
      { id: 'aov', header: 'Average order', kind: 'money' },
      { id: 'collected', header: 'Money received', kind: 'money' },
    ],
  },
  {
    id: 'items',
    name: 'Items sold',
    group: 'sales',
    rowIs: 'one dish: how many sold and how much it brought in',
    source: 'summary',
    needs: ['reports'],
    sections: ['items'],
    columns: [
      { id: 'name', header: 'Item', kind: 'text' },
      { id: 'category', header: 'Category', kind: 'text' },
      { id: 'quantity', header: 'Qty sold', kind: 'count' },
      { id: 'orders', header: 'Orders', kind: 'count' },
      { id: 'gross', header: 'Sales before discounts', kind: 'money' },
      { id: 'discounts', header: 'Discounts', kind: 'money' },
      { id: 'net', header: 'Sales', kind: 'money' },
      { id: 'avg_price', header: 'Average price', kind: 'money' },
      { id: 'share', header: 'Share of sales', kind: 'percent' },
    ],
  },
  breakdown('categories', 'Categories', 'Category', 'one menu category: what it sold', 'categories'),
  breakdown('order_types', 'Order types', 'Order type', 'one order type: dine-in, pickup, delivery', 'order_types'),
  breakdown('channels', 'Channels', 'Channel', 'one place orders come from: counter, online menu, QR, app', 'channels'),
  breakdown('branches', 'Branches', 'Branch', 'one branch: its orders and sales', 'branches', { multiBranchOnly: true }),
  {
    id: 'payments_by_method',
    name: 'Payments by method',
    group: 'sales',
    rowIs: 'one payment method: money received and how many orders used it',
    source: 'summary',
    needs: ['reports'],
    sections: ['payments'],
    columns: [
      { id: 'name', header: 'Payment method', kind: 'text' },
      { id: 'orders', header: 'Orders', kind: 'count' },
      { id: 'collected', header: 'Money received', kind: 'money' },
      { id: 'share', header: 'Share of money received', kind: 'percent' },
    ],
  },
  {
    id: 'orders',
    name: 'Orders',
    group: 'orders',
    rowIs: 'one order: when, where, who rang it up, who bought, how it was paid, and its total',
    source: 'detail',
    needs: ['reports'],
    sections: [],
    columns: [
      { id: 'order_no', header: 'Order no.', kind: 'text' },
      { id: 'business_day', header: 'Business day', kind: 'text' },
      { id: 'date', header: 'Date', kind: 'text' },
      { id: 'time', header: 'Time', kind: 'text' },
      { id: 'branch', header: 'Branch', kind: 'text' },
      { id: 'order_type', header: 'Order type', kind: 'text' },
      { id: 'channel', header: 'Channel', kind: 'text' },
      { id: 'status', header: 'Status', kind: 'text' },
      { id: 'cashier', header: 'Cashier', kind: 'text' },
      { id: 'shift', header: 'Shift', kind: 'text' },
      { id: 'table', header: 'Table', kind: 'text' },
      { id: 'customer', header: 'Customer', kind: 'text', needs: 'customers' },
      { id: 'contact', header: 'Contact', kind: 'text', needs: 'customers' },
      { id: 'items', header: 'Items', kind: 'count' },
      { id: 'gross', header: 'Sales before discounts', kind: 'money' },
      { id: 'discounts', header: 'Discounts', kind: 'money' },
      { id: 'net', header: 'Sales', kind: 'money' },
      { id: 'service', header: 'Service charge', kind: 'money' },
      { id: 'delivery', header: 'Delivery fee', kind: 'money' },
      { id: 'total', header: 'Order total', kind: 'money' },
      { id: 'collected', header: 'Money received', kind: 'money' },
      { id: 'unpaid', header: 'Still to collect', kind: 'money' },
      { id: 'payment_method', header: 'Payment method', kind: 'text' },
      { id: 'payment_status', header: 'Payment status', kind: 'text' },
      { id: 'cancel_reason', header: 'Cancel reason', kind: 'text' },
      { id: 'order_id', header: 'Order ID', kind: 'text' },
    ],
  },
  {
    id: 'order_lines',
    name: 'Order lines',
    group: 'orders',
    rowIs: 'one dish on one order: size, add-ons, quantity, price and notes',
    source: 'detail',
    needs: ['reports'],
    sections: [],
    columns: [
      { id: 'order_no', header: 'Order no.', kind: 'text' },
      { id: 'business_day', header: 'Business day', kind: 'text' },
      { id: 'date', header: 'Date', kind: 'text' },
      { id: 'time', header: 'Time', kind: 'text' },
      { id: 'status', header: 'Order status', kind: 'text' },
      { id: 'item', header: 'Item', kind: 'text' },
      { id: 'category', header: 'Category', kind: 'text' },
      { id: 'choices', header: 'Size / choices', kind: 'text' },
      { id: 'addons', header: 'Add-ons', kind: 'text' },
      { id: 'combo', header: 'Combo', kind: 'text' },
      { id: 'quantity', header: 'Qty', kind: 'count' },
      { id: 'unit_price', header: 'Price each', kind: 'money' },
      { id: 'line_total', header: 'Line total', kind: 'money' },
      { id: 'discounts', header: 'Discount share', kind: 'money' },
      { id: 'net', header: 'Sales', kind: 'money' },
      { id: 'notes', header: 'Notes', kind: 'text' },
      { id: 'order_id', header: 'Order ID', kind: 'text' },
    ],
  },
  {
    id: 'payments_received',
    name: 'Payments received',
    group: 'orders',
    rowIs: 'one payment or refund recorded on these orders: method, amount, reference',
    source: 'detail',
    needs: ['reports'],
    sections: [],
    columns: [
      { id: 'order_no', header: 'Order no.', kind: 'text' },
      { id: 'date', header: 'Date', kind: 'text' },
      { id: 'time', header: 'Time', kind: 'text' },
      { id: 'kind', header: 'Kind', kind: 'text' },
      { id: 'method', header: 'Payment method', kind: 'text' },
      { id: 'amount', header: 'Amount', kind: 'money' },
      { id: 'reference', header: 'Reference', kind: 'text' },
      { id: 'recorded_by', header: 'Recorded by', kind: 'text' },
      { id: 'note', header: 'Note', kind: 'text' },
      { id: 'order_id', header: 'Order ID', kind: 'text' },
    ],
  },
  {
    id: 'customers',
    name: 'Customers who ordered',
    group: 'customers',
    rowIs: 'one customer who ordered in the period: orders, spend, first-timer or regular',
    source: 'detail',
    needs: ['reports', 'customers'],
    sections: [],
    columns: [
      { id: 'customer', header: 'Customer', kind: 'text' },
      { id: 'contact', header: 'Contact', kind: 'text' },
      { id: 'kind', header: 'First-timer or regular', kind: 'text' },
      { id: 'orders', header: 'Orders in period', kind: 'count' },
      { id: 'net', header: 'Sales in period', kind: 'money' },
      { id: 'aov', header: 'Average order', kind: 'money' },
      { id: 'first_order', header: 'First order in period', kind: 'text' },
      { id: 'last_order', header: 'Last order in period', kind: 'text' },
      { id: 'lifetime_orders', header: 'Orders ever', kind: 'count' },
    ],
  },
  {
    id: 'discounts',
    name: 'Discounts given',
    group: 'orders',
    rowIs: 'one kind of discount on one order: Senior/PWD, voucher, manual or promo, and how much came off',
    source: 'detail',
    needs: ['reports'],
    sections: [],
    columns: [
      { id: 'order_no', header: 'Order no.', kind: 'text' },
      { id: 'business_day', header: 'Business day', kind: 'text' },
      { id: 'date', header: 'Date', kind: 'text' },
      { id: 'time', header: 'Time', kind: 'text' },
      { id: 'branch', header: 'Branch', kind: 'text' },
      { id: 'cashier', header: 'Cashier', kind: 'text' },
      { id: 'kind', header: 'Kind of discount', kind: 'text' },
      { id: 'detail', header: 'Voucher / reason', kind: 'text' },
      { id: 'amount', header: 'Amount off', kind: 'money' },
      { id: 'gross', header: 'Order before discounts', kind: 'money' },
      { id: 'order_id', header: 'Order ID', kind: 'text' },
    ],
  },
  {
    id: 'cancelled',
    name: 'Cancelled orders',
    group: 'orders',
    rowIs: 'one cancelled order: when, who rang it up, how much it was, and the reason',
    source: 'detail',
    needs: ['reports'],
    sections: [],
    columns: [
      { id: 'order_no', header: 'Order no.', kind: 'text' },
      { id: 'business_day', header: 'Business day', kind: 'text' },
      { id: 'date', header: 'Date', kind: 'text' },
      { id: 'time', header: 'Time', kind: 'text' },
      { id: 'branch', header: 'Branch', kind: 'text' },
      { id: 'order_type', header: 'Order type', kind: 'text' },
      { id: 'channel', header: 'Channel', kind: 'text' },
      { id: 'cashier', header: 'Cashier', kind: 'text' },
      { id: 'customer', header: 'Customer', kind: 'text', needs: 'customers' },
      { id: 'items', header: 'Items', kind: 'count' },
      { id: 'total', header: 'Order total', kind: 'money' },
      { id: 'refunded', header: 'Money returned', kind: 'money' },
      { id: 'cancel_reason', header: 'Cancel reason', kind: 'text' },
      { id: 'order_id', header: 'Order ID', kind: 'text' },
    ],
  },
  {
    id: 'sales_by_cashier',
    name: 'Sales by cashier',
    group: 'staff',
    rowIs: 'one cashier: the orders they rang up on the register, and what those sold',
    source: 'detail',
    needs: ['reports'],
    sections: [],
    columns: [
      { id: 'cashier', header: 'Cashier', kind: 'text' },
      { id: 'orders', header: 'Orders', kind: 'count' },
      { id: 'gross', header: 'Sales before discounts', kind: 'money' },
      { id: 'discounts', header: 'Discounts', kind: 'money' },
      { id: 'net', header: 'Sales', kind: 'money' },
      { id: 'aov', header: 'Average order', kind: 'money' },
      { id: 'collected', header: 'Money received', kind: 'money' },
      { id: 'unpaid', header: 'Still to collect', kind: 'money' },
      { id: 'cancelled', header: 'Cancelled orders', kind: 'count' },
      { id: 'share', header: 'Share of sales', kind: 'percent' },
    ],
  },
]

export const EXPORT_SHEETS: Readonly<Record<SheetId, SheetDef>> = Object.fromEntries(
  SHEET_LIST.map((sheet) => [sheet.id, sheet]),
) as Record<SheetId, SheetDef>

export function isSheetId(value: unknown): value is SheetId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(EXPORT_SHEETS, value)
}

/** The longest range a file may cover, in days, by the heaviest kind of sheet in it. */
export const MAX_SUMMARY_DAYS = 400
export const MAX_DETAIL_DAYS = 93
/** Orders one file may list. Over it the export is refused, never cut short. */
export const MAX_DETAIL_ORDERS = 20_000

export type SheetRefusal = 'no_permission' | 'single_branch'

export interface SheetAudience extends ExportAccess {
  isMultiBranch: boolean
}

/** Why this caller cannot have the sheet, or null when they can. */
export function sheetRefusal(sheet: SheetDef, audience: SheetAudience): SheetRefusal | null {
  if (!sheet.needs.every((key) => audience.has(key))) return 'no_permission'
  if (sheet.multiBranchOnly && !audience.isMultiBranch) return 'single_branch'
  return null
}

/** The columns this caller gets: one they may not see is absent, never blank. */
export function visibleColumns(sheet: SheetDef, access: ExportAccess): ExportColumn[] {
  return sheet.columns.filter((column) => !column.needs || access.has(column.needs))
}

export const SHEET_REFUSAL_NOTES: Readonly<Record<SheetRefusal, string>> = {
  no_permission: 'your account does not have access to it',
  single_branch: 'this store has one branch',
}

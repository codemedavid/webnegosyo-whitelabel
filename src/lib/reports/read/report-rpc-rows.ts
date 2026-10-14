/**
 * The platform report functions' rows (supabase/migrations/
 * 20261014110000_report_sales_functions.sql) → the engine's row types.
 *
 * Pure and validated: a row that does not have the promised shape fails
 * loudly instead of rendering as ₱0. The parity test runs these mappers over
 * the real SQL in PGlite, so what it proves is what the screens show.
 */

import { z } from 'zod'
import { normalizePayment } from '@/lib/queries/platform-analytics-merge'
import { UNSPECIFIED_METHOD_LABEL, byCentsThenLabel, type PaymentBucket } from '../payment-buckets'
import type { SalesSummary } from '../sales-model'
import type { BreakdownRow, CategoryRow, HourCell, ItemRow, PeriodRow } from '../sales-breakdowns'
import { UNCATEGORISED_KEY, UNRECORDED_KEY, byNetThenLabel } from '../sales-breakdowns'

/** PostgREST sends bigint as a JSON number; a numeric string is accepted too. */
const cents = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(number)) {
    ctx.addIssue({ code: 'custom', message: `not a whole number of centavos: ${value}` })
    return z.NEVER
  }
  return number
})

const summaryRow = z.object({
  orders: cents,
  gross_cents: cents,
  discount_cents: cents,
  delivery_discount_cents: cents,
  refund_cents: cents,
  net_cents: cents,
  service_cents: cents,
  delivery_cents: cents,
  billed_cents: cents,
  collected_cents: cents,
  unpaid_cents: cents,
  overpaid_cents: cents,
  void_orders: cents,
  void_billed_cents: cents,
  orders_without_lines: cents,
  orders_lines_mismatch: cents,
  line_gap_cents: cents,
})

const periodRow = z.object({
  bucket: z.string(),
  orders: cents,
  gross_cents: cents,
  discount_cents: cents,
  net_cents: cents,
  billed_cents: cents,
  collected_cents: cents,
})

const dimensionRow = z.object({
  key: z.string().nullable(),
  orders: cents,
  quantity: cents,
  gross_cents: cents,
  discount_cents: cents,
  net_cents: cents,
})

const hourRow = z.object({ weekday: z.number().int().min(1).max(7), hour: z.number().int().min(0).max(23), orders: cents, net_cents: cents })

const itemRow = z.object({
  item_key: z.string(),
  menu_item_id: z.string().nullable(),
  label: z.string().nullable(),
  category_label: z.string().nullable(),
  orders: cents,
  quantity: cents,
  gross_cents: cents,
  discount_cents: cents,
  net_cents: cents,
  is_unrecorded: z.boolean(),
})

const categoryRow = z.object({
  category_key: z.string(),
  label: z.string().nullable(),
  orders: cents,
  quantity: cents,
  gross_cents: cents,
  discount_cents: cents,
  net_cents: cents,
  from_current_menu: z.boolean().nullable(),
})

const paymentRow = z.object({
  method_key: z.string(),
  method_id: z.string().nullable(),
  label: z.string().nullable(),
  cents,
  orders: cents,
})

/** Report totals: the summary without the discount split by kind (Phase 6). */
export type SalesTotals = Omit<SalesSummary, 'discountByKind'>

function parseRows<T extends z.ZodType>(schema: T, rows: unknown, what: string): z.infer<T>[] {
  const parsed = z.array(schema).safeParse(rows ?? [])
  if (!parsed.success) throw new Error(`The ${what} report came back in an unexpected shape: ${parsed.error.message}`)
  return parsed.data
}

export function toSalesTotals(rows: unknown): SalesTotals {
  const [row] = parseRows(summaryRow, rows, 'sales summary')
  if (!row) throw new Error('The sales summary report returned no row.')
  return {
    orders: row.orders,
    grossCents: row.gross_cents,
    discountCents: row.discount_cents,
    deliveryDiscountCents: row.delivery_discount_cents,
    refundCents: row.refund_cents,
    netCents: row.net_cents,
    serviceCents: row.service_cents,
    deliveryCents: row.delivery_cents,
    billedCents: row.billed_cents,
    collectedCents: row.collected_cents,
    unpaidCents: row.unpaid_cents,
    overpaidCents: row.overpaid_cents,
    // Same rounding as summarizeSales (`+ 0` turns −0 into 0).
    aovCents: row.orders > 0 ? Math.round(row.net_cents / row.orders) + 0 : null,
    voids: { orders: row.void_orders, billedCents: row.void_billed_cents },
    coverage: {
      ordersWithoutLines: row.orders_without_lines,
      ordersLinesMismatch: row.orders_lines_mismatch,
      lineGapCents: row.line_gap_cents,
    },
  }
}

export function toPeriodRows(rows: unknown): PeriodRow[] {
  return parseRows(periodRow, rows, 'sales by period')
    .map((row) => ({
      key: row.bucket,
      orders: row.orders,
      grossCents: row.gross_cents,
      discountCents: row.discount_cents,
      netCents: row.net_cents,
      billedCents: row.billed_cents,
      collectedCents: row.collected_cents,
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

export function toHourCells(rows: unknown): HourCell[] {
  return parseRows(hourRow, rows, 'sales by hour')
    .map((row) => ({ weekday: row.weekday, hour: row.hour, orders: row.orders, netCents: row.net_cents }))
    .sort((a, b) => a.weekday * 24 + a.hour - (b.weekday * 24 + b.hour))
}

export interface DimensionMapping {
  /** Raw stored value (NULL kept) → the row's key. */
  keyOf: (raw: string | null) => string
  labelOf: (key: string) => string
}

/**
 * Raw `source` / `order_type` / `outlet` groups merged by the app's own
 * mapping (toSaleChannel, toOrderTypeLabel …). Every order has one raw value,
 * so the merged counts and sums are exact.
 */
export function toDimensionRows(rows: unknown, { keyOf, labelOf }: DimensionMapping): BreakdownRow[] {
  const merged = new Map<string, BreakdownRow>()
  for (const row of parseRows(dimensionRow, rows, 'sales breakdown')) {
    const key = keyOf(row.key)
    const base = merged.get(key)
    merged.set(key, {
      key,
      label: labelOf(key),
      orders: (base?.orders ?? 0) + row.orders,
      quantity: (base?.quantity ?? 0) + row.quantity,
      grossCents: (base?.grossCents ?? 0) + row.gross_cents,
      discountCents: (base?.discountCents ?? 0) + row.discount_cents,
      netCents: (base?.netCents ?? 0) + row.net_cents,
    })
  }
  return [...merged.values()].sort(byNetThenLabel)
}

export function toItemRows(rows: unknown): ItemRow[] {
  return parseRows(itemRow, rows, 'sales by item')
    .map((row) => ({
      key: row.item_key,
      label: row.label ?? '',
      menuItemId: row.menu_item_id,
      categoryLabel: row.category_label,
      isUnrecorded: row.is_unrecorded,
      orders: row.orders,
      quantity: row.quantity,
      grossCents: row.gross_cents,
      discountCents: row.discount_cents,
      netCents: row.net_cents,
    }))
    .sort(byNetThenLabel)
}

export interface CategoryReportRow extends CategoryRow {
  /** Some of its lines were sold before categories were recorded and are filed by today's menu. */
  isFromCurrentMenu: boolean
}

export function toCategoryRows(rows: unknown): CategoryReportRow[] {
  return parseRows(categoryRow, rows, 'sales by category')
    .map((row) => ({
      key: row.category_key,
      label: row.label ?? '',
      isUnrecorded: row.category_key === UNRECORDED_KEY,
      isUncategorised: row.category_key === UNCATEGORISED_KEY,
      isFromCurrentMenu: row.from_current_menu === true,
      orders: row.orders,
      quantity: row.quantity,
      grossCents: row.gross_cents,
      discountCents: row.discount_cents,
      netCents: row.net_cents,
    }))
    .sort(byNetThenLabel)
}

export function toPaymentBuckets(rows: unknown): PaymentBucket[] {
  return parseRows(paymentRow, rows, 'payments')
    .map((row) => {
      const label = row.label ?? UNSPECIFIED_METHOD_LABEL
      return {
        key: row.method_key,
        label,
        type: normalizePayment(label === UNSPECIFIED_METHOD_LABEL ? null : label),
        methodId: row.method_id,
        cents: row.cents,
        orders: row.orders,
      }
    })
    .sort(byCentsThenLabel)
}

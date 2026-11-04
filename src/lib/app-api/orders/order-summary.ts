import type {
  AppOrderDetail,
  AppOrderDraft,
  AppOrderKind,
  AppOrderStatus,
  AppOrderSummary,
} from '@/lib/app-contract'
import type { PlacedOrderLine, PlacedOrderPricing } from '@/lib/checkout/place-order/types'
import type { OrderSummary, PlacedOrderRow } from './order-index'
import { formatAppOrderNumber, type AppPaymentStatus } from './status-map'

/**
 * The snapshot an app order is stored with (`customer_app_orders.summary`) and
 * the two contract shapes read back from it. Lines, totals and names come from
 * the snapshot; status, payment status, ready time and number from a live
 * read when one is available. Pure.
 */

/** History rows show at most this many "2× Iced Latte" previews. */
const ITEMS_PREVIEW_MAX = 5

/** What a live read of the order told us; absent fields fall back to the snapshot. */
export interface LiveOrderState {
  status: AppOrderStatus
  paymentStatus: AppPaymentStatus
  estimatedReadyAt: string | null
  number: string | null
}

export interface SummaryInput {
  /** The engine's priced lines, in the order the draft's lines were sent. */
  lines: readonly PlacedOrderLine[]
  pricing: PlacedOrderPricing
  draftLines: AppOrderDraft['lines']
  /** The saved order row as its backend returned it. */
  order: unknown
  orderKind: AppOrderKind
  orderTypeName: string
  outletName: string | null
  paymentMethodName: string | null
}

const money = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0)

/** The engine's display strings: the variation (as the kitchen prints it), then each add-on. */
function optionsOf(line: PlacedOrderLine): string[] {
  const variation = line.variation?.trim()
  return [...(variation ? [variation] : []), ...line.addons.filter((addon) => addon.trim() !== '')]
}

/**
 * The store's daily number off the saved row: platform and tenant databases
 * return `daily_number` / `daily_order_number`; Convex returns only an id.
 */
export function placedOrderNumber(order: unknown): string | null {
  if (typeof order !== 'object' || order === null) return null
  const row = order as Record<string, unknown>
  return formatAppOrderNumber(row.daily_number ?? row.daily_order_number ?? row.dailyNumber ?? null)
}

/**
 * Line i of the placed order is line i of the draft (the engine prices lines
 * in place, never merging or reordering them), so its picks travel with it.
 * If the counts ever disagree the picks are dropped rather than misattributed.
 */
export function buildOrderSummary(input: SummaryInput): OrderSummary {
  const isAligned = input.lines.length === input.draftLines.length
  return {
    lines: input.lines.map((line, index) => ({
      itemId: line.menu_item_id || null,
      name: line.name,
      quantity: line.quantity,
      options: optionsOf(line),
      lineTotal: money(line.subtotal),
      selections: isAligned && input.draftLines[index].itemId === line.menu_item_id ? input.draftLines[index].selections : {},
    })),
    totals: {
      subtotal: money(input.pricing.itemsSubtotal),
      discount: money(input.pricing.discountTotal),
      serviceCharge: money(input.pricing.serviceCharge),
      deliveryFee: money(input.pricing.deliveryFee),
      total: money(input.pricing.total),
    },
    orderKind: input.orderKind,
    orderTypeName: input.orderTypeName,
    outletName: input.outletName,
    number: placedOrderNumber(input.order),
    paymentMethodName: input.paymentMethodName,
  }
}

/** Postgres hands back `+00`/`+00:00` with microseconds; the contract wants plain ISO. */
function isoOf(timestamp: string): string {
  const parsed = new Date(timestamp.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'))
  return Number.isNaN(parsed.getTime()) ? timestamp : parsed.toISOString()
}

function statusOf(row: PlacedOrderRow, live: LiveOrderState | null): AppOrderStatus {
  return live?.status ?? row.lastStatus ?? 'pending'
}

export function toAppOrderDetail(row: PlacedOrderRow, live: LiveOrderState | null): AppOrderDetail {
  const { summary } = row
  return {
    id: row.orderId,
    number: live?.number ?? summary.number,
    status: statusOf(row, live),
    placedAt: isoOf(row.placedAt),
    orderKind: summary.orderKind,
    orderTypeName: summary.orderTypeName,
    outletName: summary.outletName,
    lines: summary.lines.map((line, index) => ({
      id: `line-${index}`,
      itemId: line.itemId,
      selections: line.selections,
      name: line.name,
      quantity: line.quantity,
      options: line.options,
      lineTotal: line.lineTotal,
    })),
    totals: summary.totals,
    paymentStatus: live?.paymentStatus ?? 'unknown',
    paymentMethodName: summary.paymentMethodName,
    estimatedReadyAt: live?.estimatedReadyAt ?? null,
  }
}

export function toAppOrderSummary(row: PlacedOrderRow, live: LiveOrderState | null): AppOrderSummary {
  const { summary } = row
  return {
    id: row.orderId,
    number: live?.number ?? summary.number,
    status: statusOf(row, live),
    placedAt: isoOf(row.placedAt),
    orderKind: summary.orderKind,
    orderTypeName: summary.orderTypeName,
    outletName: summary.outletName,
    total: summary.totals.total,
    itemsPreview: summary.lines.slice(0, ITEMS_PREVIEW_MAX).map((line) => `${line.quantity}× ${line.name}`),
  }
}

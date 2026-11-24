/**
 * The one storage-neutral sale the admin dashboard counts.
 *
 * Every order backend (platform Supabase, Convex)
 * projects its rows into this shape, and every dashboard number is pure
 * arithmetic over it — so the Overview and Growth tabs can never disagree about
 * what a sale is.
 *
 * "Completed" is the Customer Growth plan's rule, shared with the customer
 * facts: a counter sale counts once paid, an online order once handed over, and
 * a cancelled / refunded / voided order never.
 *
 * Money: a platform sale carries `net`, its NET SALES by the one sales model
 * (`src/lib/reports/sales-model.ts`: after discounts, without delivery fees or
 * service charge). There the Overview follows the reports exactly
 * (`SalesBasis` 'net_sales': every live order, unpaid ones included), so the
 * dashboard and /admin/reports print the same figure. A Convex sale has no
 * net yet (Convex reports = plan Phase 7) and keeps its bill total and the
 * completed rule ('completed_totals').
 */

import {
  ONLINE_FULFILLED_STATUSES,
  POS_SETTLED_STATUSES,
  REVERSED_STATUSES,
} from '@/lib/customer-order-facts'
import { normalizeOrderType } from '@/lib/queries/platform-analytics-merge'
import { isLiveOrder } from '@/lib/reports/sales-model'

export type SaleChannel = 'counter' | 'online' | 'qr' | 'app'

export const SALE_CHANNEL_LABELS: Readonly<Record<SaleChannel, string>> = {
  counter: 'Counter (POS)',
  online: 'Online menu',
  qr: 'QR handoff',
  app: 'Customer app',
}

export interface SaleItem {
  menuItemId: string | null
  name: string
  quantity: number
  revenue: number
}

export interface SaleRecord {
  id: string
  /** Business time of the sale, epoch ms. */
  at: number
  /** The bill: what the customer was asked to pay, fees included. */
  total: number
  /**
   * Net sales of this order in pesos (sales-model `orderFigures`), when the
   * backend's reader projects it (platform). Absent = only the bill is known.
   */
  net?: number
  status: string
  paymentStatus: string | null
  channel: SaleChannel
  /** Display label, e.g. "Dine In". */
  orderType: string
  outletId: string | null
  /** Normalized E.164 phone, or null for an unidentified guest. */
  phone: string | null
  /** Null when line items were not read for this sale. */
  items: SaleItem[] | null
}

/** A completed, identified visit — the only history the Growth classifier needs. */
export interface CustomerVisit {
  phone: string
  at: number
}

function lower(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

export function toSaleChannel(source: string | null | undefined): SaleChannel {
  switch (lower(source)) {
    case 'pos':
      return 'counter'
    case 'qr_handoff':
      return 'qr'
    case 'mobile':
      return 'app'
    default:
      return 'online'
  }
}

export function toOrderTypeLabel(raw: string | null | undefined): string {
  return normalizeOrderType(raw ?? null)
}

export function isCompletedSale(
  sale: Pick<SaleRecord, 'status' | 'paymentStatus' | 'channel' | 'total'>,
): boolean {
  const status = lower(sale.status)
  if (REVERSED_STATUSES.has(status) || sale.total < 0) return false
  return sale.channel === 'counter'
    ? POS_SETTLED_STATUSES.has(lower(sale.paymentStatus))
    : ONLINE_FULFILLED_STATUSES.has(status)
}

/**
 * What a dashboard's figures are made of. `net_sales` = the reports' rule
 * (every live order, worth its net sales); `completed_totals` = the bill
 * total of completed sales (backends without a report projection).
 */
export type SalesBasis = 'net_sales' | 'completed_totals'

/** Pesos this sale adds to "sales": its net sales when known, else its bill. */
export function saleAmount(sale: Pick<SaleRecord, 'total' | 'net'>): number {
  return sale.net ?? sale.total
}

/**
 * Whether a sale counts toward the Overview's money and orders. Net sales
 * count every live order, as the reports do (an unpaid order is still a sale,
 * shown there as "still to collect"); bill totals count completed sales.
 */
export function countsTowardSales(
  sale: Pick<SaleRecord, 'status' | 'paymentStatus' | 'channel' | 'total'>,
  basis: SalesBasis,
): boolean {
  return basis === 'net_sales' ? isLiveOrder(sale) : isCompletedSale(sale)
}

export function toFiniteNumber(value: unknown): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
  return Number.isFinite(n) ? n : 0
}

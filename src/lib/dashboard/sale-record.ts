/**
 * The one storage-neutral sale the admin dashboard counts.
 *
 * Every order backend (platform Supabase, a tenant's own Supabase, Convex)
 * projects its rows into this shape, and every dashboard number is pure
 * arithmetic over it — so the Overview and Growth tabs can never disagree about
 * what a sale is.
 *
 * "Completed" is the Customer Growth plan's rule, shared with the customer
 * facts: a counter sale counts once paid, an online order once handed over, and
 * a cancelled / refunded / voided order never.
 */

import {
  ONLINE_FULFILLED_STATUSES,
  POS_SETTLED_STATUSES,
  REVERSED_STATUSES,
} from '@/lib/customer-order-facts'
import { normalizeOrderType } from '@/lib/queries/platform-analytics-merge'

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
  total: number
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

export function toFiniteNumber(value: unknown): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
  return Number.isFinite(n) ? n : 0
}

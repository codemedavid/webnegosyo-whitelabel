/**
 * Who is behind an order, and what that order did to their stamp card.
 *
 * Pure. The merchant's order queue asks this for a page of orders at once, so
 * a cashier can see "a member is ordering" and "this order earned a stamp"
 * without opening every ticket. The reads live in `order-customer-repository.ts`.
 *
 * The stamp is read off the LEDGER, never inferred from the order status: an
 * order can be delivered and still not earn (below the minimum spend, a paused
 * card), and saying "earned" there would promise a stamp the customer does
 * not hold.
 */

import type { LoyaltyMemberProgress, LoyaltyMemberStatus } from './members'

export const ORDER_CUSTOMER_BACKENDS = ['platform_supabase', 'convex', 'tenant_supabase'] as const
export type OrderCustomerBackend = (typeof ORDER_CUSTOMER_BACKENDS)[number]

/** One order-list page. A larger batch is a client bug, not a bigger query. */
export const MAX_ORDERS_PER_REQUEST = 100

/** Statuses after which an order that has not earned never will. */
const CLOSED_STATUSES = new Set([
  'delivered',
  'completed',
  'cancelled',
  'canceled',
  'refunded',
  'voided',
])

export interface OrderCustomerQueryOrder {
  /** The id the order's own backend knows it by — what the ledger records. */
  orderId: string
  contact: string | null
  customerData: Record<string, unknown> | null
  status: string | null
}

export interface OrderCustomersRequest {
  backend: OrderCustomerBackend
  orders: OrderCustomerQueryOrder[]
}

export interface OrderLedgerRow {
  orderId: string
  programId: string
  customerKey: string
  kind: string
  delta: number
  isShadow: boolean
}

export type OrderStampState = 'earned' | 'returned' | 'pending' | 'none'

export interface OrderStamp {
  state: OrderStampState
  /** Net stamps/points this order left on the card. */
  delta: number
  /** The card it earned on; null when it earned nothing. */
  programId: string | null
}

export interface OrderCustomerSummary {
  orderId: string
  customerKey: string
  customerId: string | null
  name: string | null
  /** A `customers` row exists — the store has seen this person before. */
  hasProfile: boolean
  orderCount: number | null
  totalSpent: number | null
  /** Holds a balance on at least one card. */
  isMember: boolean
  status: LoyaltyMemberStatus | null
  /** The card nearest to a reward, as the member screen headlines it. */
  headline: LoyaltyMemberProgress | null
  rewardsAvailable: number
  stamp: OrderStamp & { programName: string | null }
}

export interface OrderCustomersResult {
  isLoyaltyLive: boolean
  customers: OrderCustomerSummary[]
}

/**
 * The identity to look up for an order.
 *
 * The earn row wins: a receipt claim attaches a number AFTER the order was
 * placed, so the order's own contact can be blank while the stamp is real.
 */
export function customerKeyForOrder(rows: OrderLedgerRow[], phoneE164: string | null): string | null {
  const earned = rows.find((row) => !row.isShadow && row.customerKey)
  if (earned) return earned.customerKey
  return phoneE164 ? `phone:${phoneE164}` : null
}

export function summarizeOrderStamp(
  rows: OrderLedgerRow[],
  context: { status: string | null; isLoyaltyLive: boolean; hasActiveProgram: boolean }
): OrderStamp {
  const real = rows.filter((row) => !row.isShadow)
  const earns = real.filter((row) => row.kind === 'earn' && row.delta > 0)

  if (earns.length > 0) {
    const net = real
      .filter((row) => row.kind === 'earn' || row.kind === 'reverse')
      .reduce((sum, row) => sum + row.delta, 0)
    return {
      state: net > 0 ? 'earned' : 'returned',
      delta: Math.max(0, net),
      programId: earns[0].programId,
    }
  }

  const status = (context.status ?? '').trim().toLowerCase()
  const canStillEarn =
    context.isLoyaltyLive && context.hasActiveProgram && !CLOSED_STATUSES.has(status)

  return { state: canStillEarn ? 'pending' : 'none', delta: 0, programId: null }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseOrderCustomersRequest(
  body: unknown
): { ok: true; value: OrderCustomersRequest } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: 'A JSON body is required.' }

  const backend = text(body.backend) as OrderCustomerBackend | null
  if (!backend || !ORDER_CUSTOMER_BACKENDS.includes(backend)) {
    return { ok: false, error: `backend must be one of ${ORDER_CUSTOMER_BACKENDS.join(', ')}.` }
  }
  if (!Array.isArray(body.orders)) return { ok: false, error: 'orders must be a list.' }
  if (body.orders.length > MAX_ORDERS_PER_REQUEST) {
    return { ok: false, error: `At most ${MAX_ORDERS_PER_REQUEST} orders per request.` }
  }

  const seen = new Set<string>()
  const orders: OrderCustomerQueryOrder[] = []
  for (const raw of body.orders) {
    if (!isRecord(raw)) continue
    const orderId = text(raw.orderId)
    if (!orderId || seen.has(orderId)) continue
    seen.add(orderId)
    orders.push({
      orderId,
      contact: text(raw.contact),
      customerData: isRecord(raw.customerData) ? raw.customerData : null,
      status: text(raw.status),
    })
  }

  return { ok: true, value: { backend, orders } }
}

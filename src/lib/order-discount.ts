/**
 * Persisting an order's discount across three different order backends.
 *
 * Tenants keep their orders in Convex, in the shared platform Postgres, or in
 * their own Postgres. The Convex schema is deployed PER TENANT, so a new column
 * there only reaches tenants who have been redeployed — which is why POS
 * payments ride inside the free-form `customerData` blob instead (see
 * `webnegosyo-app/lib/pos-order.ts`). Discounts take the same route.
 *
 * Invariant worth stating plainly: an order's `total` is ALWAYS already net of
 * the discount, on every backend. This payload is the breakdown — what to print
 * on the receipt, what to give back on a partial refund — and never the source
 * of the amount charged. Nothing should ever subtract it from `total` again.
 */

import type { VoucherApplication } from './vouchers/stacking'

/** One deducted line as stored. Mirrors `OrderDiscountLine` plus its origin. */
export interface StoredDiscountLine {
  label: string
  amount: number
  voucherId?: string
  code?: string
}

export interface OrderDiscountPayload {
  /** Total taken off, lines plus delivery. */
  total: number
  /** The part that came off delivery rather than the food. */
  deliveryDiscount: number
  lines: StoredDiscountLine[]
  /** Per cart line, so a partial refund can be computed later. */
  allocationsByLine: Record<string, number>
}

/**
 * Reduces a resolved voucher application to what is worth persisting.
 * Returns null when nothing was discounted, so an ordinary order carries no
 * discount key at all.
 */
export function buildOrderDiscountPayload(
  application: VoucherApplication,
): OrderDiscountPayload | null {
  if (application.discountTotal <= 0 || application.discountLines.length === 0) return null

  return {
    total: application.discountTotal,
    deliveryDiscount: application.deliveryDiscount,
    lines: application.discountLines.map((line) => ({
      label: line.label,
      amount: line.amount,
      ...(line.voucherId ? { voucherId: line.voucherId } : {}),
      ...(line.code ? { code: line.code } : {}),
    })),
    allocationsByLine: { ...application.allocationsByLine },
  }
}

/**
 * Nests the payload under `customerData.discount`, leaving everything already
 * in the blob (outlet, schedule, POS payment) untouched. Returns a new object.
 */
export function writeOrderDiscount(
  customerData: Record<string, unknown> | undefined | null,
  payload: OrderDiscountPayload | null,
): Record<string, unknown> {
  const base = { ...(customerData ?? {}) }
  if (!payload) return base
  return { ...base, discount: payload }
}

/** Shape-checks an untyped blob before trusting it. */
function asPayload(value: unknown): OrderDiscountPayload | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null

  const candidate = value as Partial<OrderDiscountPayload>
  if (typeof candidate.total !== 'number' || !Number.isFinite(candidate.total)) return null

  return {
    total: candidate.total,
    deliveryDiscount: typeof candidate.deliveryDiscount === 'number' ? candidate.deliveryDiscount : 0,
    lines: Array.isArray(candidate.lines) ? candidate.lines : [],
    allocationsByLine:
      typeof candidate.allocationsByLine === 'object' && candidate.allocationsByLine !== null
        ? candidate.allocationsByLine
        : {},
  }
}

/**
 * Reads the discount off an order from whichever backend produced it.
 *
 * The `discount_data` column wins over the blob: a tenant migrated from Convex
 * to Postgres can carry both, and the column is what reporting queries
 * aggregate. Returns null — never throws — for orders with no discount and for
 * malformed blobs, because the blob is untyped at the database edge and a
 * reader must not assume its shape.
 */
export function readOrderDiscount(order: unknown): OrderDiscountPayload | null {
  if (typeof order !== 'object' || order === null) return null

  const row = order as {
    discount_data?: unknown
    customerData?: unknown
    customer_data?: unknown
  }

  const fromColumn = asPayload(row.discount_data)
  if (fromColumn) return fromColumn

  const blob = row.customerData ?? row.customer_data
  if (typeof blob !== 'object' || blob === null) return null

  return asPayload((blob as { discount?: unknown }).discount)
}

/**
 * Derived customer insights for the owner's "Regulars" view.
 *
 * The `customers` table stores raw facts (counts, spend, dates, item tallies).
 * A merchant, though, asks three questions about a regular:
 *   - How often do they come back?      → cadence / orders per month
 *   - What do they always order?        → favourite item
 *   - What are they worth?              → lifetime value + a 12-month projection
 *
 * All three are derivable from the stored row, so they live here as a pure
 * function instead of extra columns or extra queries. Pure + `now`-injected so
 * the recency maths is deterministic under test and free of hydration drift.
 */
import type { Customer, CustomerTopItem } from '@/types/database'

/** Mean days per month — cadence is expressed per calendar month, not per 30d. */
const DAYS_PER_MONTH = 30.44
const MS_PER_DAY = 24 * 60 * 60 * 1000
/** Horizon for the forward-looking value projection. */
const PROJECTION_MONTHS = 12
/** Silence beyond this many cadence-cycles means the customer is slipping. */
const AT_RISK_CYCLES = 1.5
/** Silence beyond this many cadence-cycles means they have effectively churned. */
const LAPSED_CYCLES = 3
/** Cadence assumed for customers whose own cadence cannot be derived. */
const DEFAULT_CADENCE_DAYS = 30

export type CustomerStatus = 'new' | 'active' | 'at_risk' | 'lapsed'

export interface CustomerInsights {
  /** The single most-ordered item, or null when nothing was recorded. */
  favoriteItem: CustomerTopItem | null
  /** Mean days between consecutive orders; null for one-off or same-day-only customers. */
  daysBetweenOrders: number | null
  /** Orders per calendar month implied by the cadence; 0 when no cadence exists. */
  ordersPerMonth: number
  /** Short human label for the cadence, e.g. "Every ~15 days". */
  frequencyLabel: string
  /** Whole days since the last order; null when they have never ordered. */
  daysSinceLastOrder: number | null
  /** Actual money this customer has spent to date. */
  lifetimeValue: number
  /** Projected 12-month value at the current cadence; falls back to actual spend. */
  projectedLtv: number
  status: CustomerStatus
}

/** Postgres `numeric` arrives as a string over PostgREST — coerce defensively. */
function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toMs(value: string | null): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

/** The most-ordered item, resolved independently of the stored array's order. */
function pickFavorite(topItems: CustomerTopItem[] | null | undefined): CustomerTopItem | null {
  if (!topItems?.length) return null
  return topItems.reduce((best, item) =>
    toNumber(item.quantity) > toNumber(best.quantity) ? item : best
  )
}

/**
 * Mean gap between orders, measured across the customer's own lifespan rather
 * than a fixed window: `span / (orderCount - 1)`. Returns null when there is no
 * gap to measure — a single order, or several orders all on the same day —
 * because inventing a cadence there would fabricate a trend from one data point.
 */
function computeCadence(customer: Customer): number | null {
  const orderCount = toNumber(customer.order_count)
  if (orderCount < 2) return null

  const firstMs = toMs(customer.first_order_at)
  const lastMs = toMs(customer.last_order_at)
  if (firstMs === null || lastMs === null) return null

  const spanDays = (lastMs - firstMs) / MS_PER_DAY
  if (spanDays <= 0) return null

  return round(spanDays / (orderCount - 1), 1)
}

function buildFrequencyLabel(orderCount: number, cadenceDays: number | null): string {
  if (orderCount <= 1) return 'First-time'
  if (cadenceDays === null) return 'Repeat'
  if (cadenceDays < 1) return 'Multiple times a day'
  return `Every ~${Math.round(cadenceDays)} days`
}

function resolveStatus(
  orderCount: number,
  cadenceDays: number | null,
  daysSinceLastOrder: number | null
): CustomerStatus {
  if (orderCount <= 1 || daysSinceLastOrder === null) return 'new'

  const cycle = cadenceDays ?? DEFAULT_CADENCE_DAYS
  if (daysSinceLastOrder <= cycle * AT_RISK_CYCLES) return 'active'
  if (daysSinceLastOrder <= cycle * LAPSED_CYCLES) return 'at_risk'
  return 'lapsed'
}

/**
 * Derive the merchant-facing insights for one customer row.
 * `now` is injected so recency is deterministic (tests, SSR/CSR parity).
 */
export function computeCustomerInsights(customer: Customer, now: Date = new Date()): CustomerInsights {
  const orderCount = toNumber(customer.order_count)
  const lifetimeValue = round(toNumber(customer.total_spent), 2)
  const averageOrderValue = toNumber(customer.average_order_value)

  const cadenceDays = computeCadence(customer)
  const ordersPerMonth = cadenceDays ? round(DAYS_PER_MONTH / cadenceDays, 2) : 0

  const lastMs = toMs(customer.last_order_at)
  const daysSinceLastOrder =
    lastMs === null ? null : Math.max(0, Math.floor((now.getTime() - lastMs) / MS_PER_DAY))

  // Projection is only meaningful once a repeat pattern exists; otherwise the
  // honest answer is what they have actually spent.
  const projectedLtv =
    ordersPerMonth > 0
      ? round(averageOrderValue * ordersPerMonth * PROJECTION_MONTHS, 2)
      : lifetimeValue

  return {
    favoriteItem: pickFavorite(customer.top_items),
    daysBetweenOrders: cadenceDays,
    ordersPerMonth,
    frequencyLabel: buildFrequencyLabel(orderCount, cadenceDays),
    daysSinceLastOrder,
    lifetimeValue,
    projectedLtv,
    status: resolveStatus(orderCount, cadenceDays, daysSinceLastOrder),
  }
}

/** Badge copy for each engagement status, for the owner list. */
export const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  new: 'New',
  active: 'Active',
  at_risk: 'At risk',
  lapsed: 'Lapsed',
}

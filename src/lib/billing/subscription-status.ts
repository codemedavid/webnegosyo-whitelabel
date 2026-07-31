/**
 * Whether a merchant's admin and app are open, decided from their subscription.
 *
 * Pure and dependency-free, like `outlets/selection-timing.ts`, because three
 * surfaces have to reach the same verdict: the web admin layout, the server
 * actions behind it, and the merchant mobile app. A shared function is the only
 * way those three cannot drift into disagreeing about who is paid up.
 *
 * The bias is deliberate and one-directional: EVERY uncertain case resolves to
 * open. A tenant with no row, no due date, a corrupt date, or a clock that will
 * not parse gets in. Being wrongly open costs the platform days of one ₱649
 * subscription; being wrongly closed stops a restaurant from taking orders, and
 * the merchant cannot fix it themselves — they can only ring support and wait.
 *
 * The customer storefront is NOT gated here. A paused merchant keeps selling
 * while they settle up; only the tools they manage the store with go dark.
 */

import { toBusinessDayKey } from '@/lib/inventory/business-day'
import { DEFAULT_MAX_OUTLETS, DEFAULT_MAX_STAFF_PER_BRANCH } from '@/lib/billing/plan'

/** Days a merchant keeps access after their paid period ends. */
export const DEFAULT_GRACE_DAYS = 3

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Statuses that close the door on their own, whatever the dates say.
 *
 * Both are deliberate acts by the platform owner, so a paid-through date left
 * over from the last payment must not quietly undo them.
 */
const TERMINAL_STATUSES = new Set(['cancelled', 'paused'])

/**
 * Whether this status was set by a person rather than reached by the calendar.
 *
 * Exported so the collections screen can offer "Resume" on exactly these and
 * not on a tenant whose dates ran out — that one needs paying, not un-pausing.
 */
export function isManualBlockStatus(status: string | null | undefined): boolean {
  return TERMINAL_STATUSES.has((status ?? '').toLowerCase())
}

export type SubscriptionState = 'active' | 'grace' | 'paused'

/** The subset of a `tenant_subscriptions` row this module needs. */
export interface SubscriptionRecord {
  status?: string | null
  /** `YYYY-MM-DD`; the last day the merchant has paid for. */
  paid_through?: string | null
  grace_days?: number | null
}

export interface SubscriptionAccess {
  state: SubscriptionState
  /** Whether the admin and app should be closed. Never true for `grace`. */
  isBlocked: boolean
  /** Whole Manila days past `paid_through`; 0 while still inside it. */
  daysOverdue: number
  /**
   * Whole Manila days remaining before `paid_through` lapses; 0 on the last
   * paid day itself.
   *
   * Null whenever the question does not apply — no due date, already overdue,
   * or manually paused. Null rather than a negative number so a caller cannot
   * accidentally read "-40 days left" as a renewal that is still in the future;
   * `daysOverdue` is the field that carries lateness.
   */
  daysUntilDue: number | null
  /** The stored due date, echoed for the paused screen. */
  paidThroughDayKey: string | null
  /** First day access stops, so a merchant in grace can be warned. */
  blockedFromDayKey: string | null
}

const OPEN: SubscriptionAccess = {
  state: 'active',
  isBlocked: false,
  daysOverdue: 0,
  daysUntilDue: null,
  paidThroughDayKey: null,
  blockedFromDayKey: null,
}

function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_KEY_PATTERN.test(value)) return false

  // `Date.parse` rolls "2026-13-45" over on some engines, so the round-trip is
  // what actually rejects an impossible date.
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Nonsense or missing grace becomes the default; negative becomes none. */
function resolveGraceDays(graceDays: number | null | undefined): number {
  if (graceDays === null || graceDays === undefined) return DEFAULT_GRACE_DAYS
  if (!Number.isFinite(graceDays)) return DEFAULT_GRACE_DAYS
  return Math.max(0, Math.floor(graceDays))
}

/** Whole days from one `YYYY-MM-DD` to another. */
function daysBetween(fromDayKey: string, toDayKey: string): number {
  const from = Date.parse(`${fromDayKey}T00:00:00.000Z`)
  const to = Date.parse(`${toDayKey}T00:00:00.000Z`)
  return Math.round((to - from) / MILLISECONDS_PER_DAY)
}

/** `YYYY-MM-DD` a whole number of days after another. */
export function addDays(dayKey: string, days: number): string {
  const shifted = Date.parse(`${dayKey}T00:00:00.000Z`) + days * MILLISECONDS_PER_DAY
  return new Date(shifted).toISOString().slice(0, 10)
}

/**
 * The access verdict for a subscription at a given instant.
 *
 * `nowIso` is passed in rather than read from the clock so the caller — and the
 * tests — control time. Days are Manila days, the same boundary the order
 * numbers and the daily report already use, so "today" means one thing on this
 * platform.
 */
export function resolveSubscriptionAccess(
  subscription: SubscriptionRecord | null | undefined,
  nowIso: string
): SubscriptionAccess {
  if (!subscription) return OPEN

  const paidThrough = subscription.paid_through
  const paidThroughDayKey = isDayKey(paidThrough) ? paidThrough : null

  if (isManualBlockStatus(subscription.status)) {
    return {
      state: 'paused',
      isBlocked: true,
      daysOverdue: 0,
      // A tenant the platform owner cut off is not "renewing in 20 days",
      // however much time their stored date still shows.
      daysUntilDue: null,
      paidThroughDayKey,
      blockedFromDayKey: null,
    }
  }

  // No due date is an unconfigured account, not a delinquent one.
  if (!paidThroughDayKey) return { ...OPEN, paidThroughDayKey: null }

  let today: string
  try {
    today = toBusinessDayKey(nowIso)
  } catch {
    // An unreadable clock is the platform's fault, never the merchant's.
    return { ...OPEN, paidThroughDayKey }
  }

  const graceDays = resolveGraceDays(subscription.grace_days)
  const blockedFromDayKey = addDays(paidThroughDayKey, graceDays + 1)

  // Paid THROUGH that day means the day itself is theirs in full, so the last
  // paid day is 0 days out rather than 1.
  if (today <= paidThroughDayKey) {
    return {
      state: 'active',
      isBlocked: false,
      daysOverdue: 0,
      daysUntilDue: daysBetween(today, paidThroughDayKey),
      paidThroughDayKey,
      blockedFromDayKey,
    }
  }

  const daysOverdue = daysBetween(paidThroughDayKey, today)

  if (daysOverdue <= graceDays) {
    return {
      state: 'grace',
      isBlocked: false,
      daysOverdue,
      daysUntilDue: null,
      paidThroughDayKey,
      blockedFromDayKey,
    }
  }

  return {
    state: 'paused',
    isBlocked: true,
    daysOverdue,
    daysUntilDue: null,
    paidThroughDayKey,
    blockedFromDayKey,
  }
}

/** The subset of a tenant row carrying its allowances. */
export interface TenantLimitFields {
  max_outlets?: number | null
  max_staff_per_branch?: number | null
}

/** A positive whole allowance, or the platform default when unset or nonsense. */
function resolveLimit(value: number | null | undefined, fallback: number): number {
  if (value === null || value === undefined) return fallback
  if (!Number.isFinite(value)) return fallback
  const floored = Math.floor(value)
  return floored < 0 ? fallback : floored
}

/** How many staff accounts this tenant may hold per branch. */
export function resolveStaffLimit(tenant: TenantLimitFields | null | undefined): number {
  return resolveLimit(tenant?.max_staff_per_branch, DEFAULT_MAX_STAFF_PER_BRANCH)
}

/** How many branches this tenant may create. */
export function resolveOutletLimit(tenant: TenantLimitFields | null | undefined): number {
  return resolveLimit(tenant?.max_outlets, DEFAULT_MAX_OUTLETS)
}

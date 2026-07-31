/**
 * The superadmin's collections view: every tenant, ranked by who needs chasing.
 *
 * Pure, so the ordering and the arithmetic are testable without a database.
 * The page fetches; this decides what the rows mean.
 *
 * Ordered by urgency rather than alphabetically. A list of 172 tenants sorted
 * by name buries the three that owe money, and a collections screen that hides
 * the debtors is decoration.
 */

import { resolveSubscriptionAccess, type SubscriptionState } from '@/lib/billing/subscription-status'
import { MONTHLY_PRICE_PHP } from '@/lib/billing/plan'

export interface RosterInput {
  tenantId: string
  name: string
  slug: string
  status?: string | null
  paidThrough?: string | null
  graceDays?: number | null
  monthlyPricePhp?: number | null
}

export interface RosterRow {
  tenantId: string
  name: string
  slug: string
  state: SubscriptionState
  isBlocked: boolean
  daysOverdue: number
  /** Days left before the paid period lapses; null when not applicable. */
  daysUntilDue: number | null
  /** Current, but lapsing inside `DUE_SOON_WINDOW_DAYS`. Never true when late. */
  isDueSoon: boolean
  paidThroughDayKey: string | null
  monthlyPricePhp: number
}

export interface RosterSummary {
  total: number
  active: number
  inGrace: number
  paused: number
  /** Tenants still current, but lapsing inside the window. */
  dueSoon: number
  /** Monthly recurring revenue from tenants who are actually paying. */
  mrrPhp: number
  /** Money owed right now, by everyone past their paid-through date. */
  overduePhp: number
  /**
   * Money expected to come in this week. A forecast, deliberately kept apart
   * from `overduePhp`: blending a debt into a projection would let the owner
   * read money already owed as money still on schedule.
   */
  dueSoonPhp: number
}

/**
 * How far ahead the collections screen looks for renewals.
 *
 * A week, because that is the horizon the platform owner actually works to —
 * long enough to send a reminder and be paid before the date, short enough that
 * the list stays a to-do rather than a directory.
 */
export const DUE_SOON_WINDOW_DAYS = 7

/**
 * Sort weight: the more urgent, the lower.
 *
 * Money owed outranks money merely expected, so `dueSoon` sits below both
 * arrears states and above the comfortably paid.
 */
const PAUSED_ORDER = 0
const GRACE_ORDER = 1
const DUE_SOON_ORDER = 2
const ACTIVE_ORDER = 3

function sortWeight(row: RosterRow): number {
  if (row.state === 'paused') return PAUSED_ORDER
  if (row.state === 'grace') return GRACE_ORDER
  return row.isDueSoon ? DUE_SOON_ORDER : ACTIVE_ORDER
}

function toRow(input: RosterInput, nowIso: string): RosterRow {
  const access = resolveSubscriptionAccess(
    { status: input.status, paid_through: input.paidThrough, grace_days: input.graceDays },
    nowIso
  )

  return {
    tenantId: input.tenantId,
    name: input.name,
    slug: input.slug,
    state: access.state,
    isBlocked: access.isBlocked,
    daysOverdue: access.daysOverdue,
    daysUntilDue: access.daysUntilDue,
    // `daysUntilDue` is null for everyone without a live due date — the
    // unbilled, the late and the manually paused alike — so this cannot
    // mistake an unconfigured account for a renewal falling due today.
    isDueSoon: access.daysUntilDue !== null && access.daysUntilDue <= DUE_SOON_WINDOW_DAYS,
    paidThroughDayKey: access.paidThroughDayKey,
    monthlyPricePhp: input.monthlyPricePhp ?? MONTHLY_PRICE_PHP,
  }
}

/**
 * Every tenant, most urgent first.
 *
 * Within a state, the longest-overdue comes first — that is the one whose
 * relationship is closest to being lost, not merely the one who owes most.
 */
export function buildSubscriptionRoster(
  inputs: readonly RosterInput[],
  nowIso: string
): RosterRow[] {
  return [...inputs]
    .map((input) => toRow(input, nowIso))
    .sort((a, b) => {
      const byState = sortWeight(a) - sortWeight(b)
      if (byState !== 0) return byState

      const byOverdue = b.daysOverdue - a.daysOverdue
      if (byOverdue !== 0) return byOverdue

      // Soonest to lapse first, so the top of the due-soon group is the tenant
      // to ring today.
      if (a.daysUntilDue !== null && b.daysUntilDue !== null) {
        const byDue = a.daysUntilDue - b.daysUntilDue
        if (byDue !== 0) return byDue
      }

      return a.name.localeCompare(b.name)
    })
}

/**
 * The headline figures.
 *
 * MRR counts only tenants who are genuinely current. Counting a paused tenant's
 * ₱649 would report revenue that is not arriving, and a number that flatters is
 * worse than no number.
 */
export function summarizeRoster(rows: readonly RosterRow[]): RosterSummary {
  return rows.reduce<RosterSummary>(
    (summary, row) => ({
      total: summary.total + 1,
      active: summary.active + (row.state === 'active' ? 1 : 0),
      inGrace: summary.inGrace + (row.state === 'grace' ? 1 : 0),
      paused: summary.paused + (row.state === 'paused' ? 1 : 0),
      dueSoon: summary.dueSoon + (row.isDueSoon ? 1 : 0),
      mrrPhp: summary.mrrPhp + (row.state === 'active' ? row.monthlyPricePhp : 0),
      dueSoonPhp: summary.dueSoonPhp + (row.isDueSoon ? row.monthlyPricePhp : 0),
      // Anyone past their date owes, grace or not. Grace buys them access, not
      // forgiveness.
      //
      // `paused` is counted even at zero days overdue, and that case is not
      // hypothetical: `resolveSubscriptionAccess` hardcodes `daysOverdue: 0`
      // for the terminal `paused`/`cancelled` statuses however stale their
      // `paid_through` is. On a days-overdue test alone, a tenant the platform
      // owner manually cut off months ago contributes ₱0 to the one figure on
      // this screen that means "money owed right now" — the most delinquent
      // accounts excluded from the collections total.
      overduePhp:
        summary.overduePhp +
        (row.daysOverdue > 0 || row.state === 'paused' ? row.monthlyPricePhp : 0),
    }),
    { total: 0, active: 0, inGrace: 0, paused: 0, dueSoon: 0, mrrPhp: 0, overduePhp: 0, dueSoonPhp: 0 }
  )
}

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
  paidThroughDayKey: string | null
  monthlyPricePhp: number
}

export interface RosterSummary {
  total: number
  active: number
  inGrace: number
  paused: number
  /** Monthly recurring revenue from tenants who are actually paying. */
  mrrPhp: number
  /** Money owed right now, by everyone past their paid-through date. */
  overduePhp: number
}

/** Sort weight: the more urgent, the lower. */
const STATE_ORDER: Record<SubscriptionState, number> = {
  paused: 0,
  grace: 1,
  active: 2,
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
      const byState = STATE_ORDER[a.state] - STATE_ORDER[b.state]
      if (byState !== 0) return byState

      const byOverdue = b.daysOverdue - a.daysOverdue
      if (byOverdue !== 0) return byOverdue

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
      mrrPhp: summary.mrrPhp + (row.state === 'active' ? row.monthlyPricePhp : 0),
      // Anyone past their date owes, grace or not. Grace buys them access, not
      // forgiveness.
      overduePhp: summary.overduePhp + (row.daysOverdue > 0 ? row.monthlyPricePhp : 0),
    }),
    { total: 0, active: 0, inGrace: 0, paused: 0, mrrPhp: 0, overduePhp: 0 }
  )
}

/**
 * What the collections total counts as owed.
 *
 * `overduePhp` is the one figure on the subscriptions screen that means "money
 * owed right now", and it was summing only rows with `daysOverdue > 0`. But
 * `resolveSubscriptionAccess` hardcodes `daysOverdue: 0` for the terminal
 * `paused`/`cancelled` statuses however stale their `paid_through` is — so the
 * most delinquent tenants on the platform contributed nothing to it.
 */

import { summarizeRoster } from '@/lib/billing/subscription-roster'
import type { RosterRow } from '@/lib/billing/subscription-roster'

const rosterRow = (overrides: Partial<RosterRow> = {}): RosterRow => ({
  tenantId: 't1',
  name: 'Cafe One',
  slug: 'cafe-one',
  state: 'active',
  isBlocked: false,
  daysOverdue: 0,
  monthlyPricePhp: 649,
  paidThroughDayKey: '2026-08-31',
  status: 'active',
  ...overrides,
} as RosterRow)

describe('what the collections total counts as owed', () => {
  test('a tenant paused at zero days overdue still owes', () => {
    // `resolveSubscriptionAccess` hardcodes `daysOverdue: 0` for the terminal
    // `paused`/`cancelled` statuses however stale their `paid_through` is. On a
    // days-overdue test alone, a tenant the platform owner cut off months ago
    // contributed nothing to the one figure that means "money owed right now" —
    // the most delinquent accounts missing from the collections screen.
    const summary = summarizeRoster([
      rosterRow({ state: 'paused', isBlocked: true, daysOverdue: 0, status: 'paused' }),
    ])

    expect(summary.overduePhp).toBe(649)
    expect(summary.mrrPhp).toBe(0)
  })

  test('a tenant in grace owes too — grace buys access, not forgiveness', () => {
    const summary = summarizeRoster([
      rosterRow({ state: 'grace', daysOverdue: 2, monthlyPricePhp: 499 }),
    ])

    expect(summary.overduePhp).toBe(499)
  })

  test('a current tenant owes nothing and counts toward MRR', () => {
    const summary = summarizeRoster([rosterRow()])

    expect(summary.overduePhp).toBe(0)
    expect(summary.mrrPhp).toBe(649)
  })
})

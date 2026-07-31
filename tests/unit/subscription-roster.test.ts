/**
 * The collections view's ordering and totals.
 *
 * Two decisions are worth locking down: that debtors surface first (a list of
 * 172 tenants sorted by name hides the three that matter), and that MRR never
 * counts money which is not arriving.
 */

import { buildSubscriptionRoster, summarizeRoster } from '@/lib/billing/subscription-roster'

const NOW = '2026-08-10T07:00:00.000Z'

const PAID = { tenantId: 't1', name: 'Alpha Cafe', slug: 'alpha', paidThrough: '2026-08-31' }
const GRACE = { tenantId: 't2', name: 'Bravo Grill', slug: 'bravo', paidThrough: '2026-08-09' }
const LAPSED = { tenantId: 't3', name: 'Charlie Bar', slug: 'charlie', paidThrough: '2026-07-31' }
const LONG_LAPSED = { tenantId: 't4', name: 'Delta Deli', slug: 'delta', paidThrough: '2026-05-01' }

describe('buildSubscriptionRoster', () => {
  it('puts paused tenants above everyone else', () => {
    const rows = buildSubscriptionRoster([PAID, GRACE, LAPSED], NOW)

    expect(rows[0].tenantId).toBe('t3')
  })

  it('puts tenants in grace above paid ones', () => {
    const rows = buildSubscriptionRoster([PAID, GRACE], NOW)

    expect(rows.map((r) => r.tenantId)).toEqual(['t2', 't1'])
  })

  it('ranks the longest-overdue first within the paused group', () => {
    // Longest overdue, not largest debt: that is the relationship closest to
    // being lost.
    const rows = buildSubscriptionRoster([LAPSED, LONG_LAPSED], NOW)

    expect(rows.map((r) => r.tenantId)).toEqual(['t4', 't3'])
  })

  it('falls back to name order for tenants in the same state', () => {
    const rows = buildSubscriptionRoster(
      [
        { tenantId: 'z', name: 'Zulu', slug: 'z', paidThrough: '2026-08-31' },
        { tenantId: 'a', name: 'Alpha', slug: 'a', paidThrough: '2026-08-31' },
      ],
      NOW
    )

    expect(rows.map((r) => r.name)).toEqual(['Alpha', 'Zulu'])
  })

  it('does not mutate the input array', () => {
    const inputs = [PAID, LAPSED]

    buildSubscriptionRoster(inputs, NOW)

    expect(inputs[0]).toBe(PAID)
  })

  it('defaults a tenant with no stored price to the standard monthly price', () => {
    const rows = buildSubscriptionRoster([PAID], NOW)

    expect(rows[0].monthlyPricePhp).toBe(649)
  })

  it('honours a negotiated price on an individual tenant', () => {
    const rows = buildSubscriptionRoster([{ ...PAID, monthlyPricePhp: 1200 }], NOW)

    expect(rows[0].monthlyPricePhp).toBe(1200)
  })
})

describe('summarizeRoster', () => {
  it('counts each state', () => {
    const rows = buildSubscriptionRoster([PAID, GRACE, LAPSED], NOW)

    expect(summarizeRoster(rows)).toMatchObject({ total: 3, active: 1, inGrace: 1, paused: 1 })
  })

  it('excludes paused tenants from MRR', () => {
    // Counting a paused tenant's ₱649 would report revenue that is not
    // arriving. A number that flatters is worse than no number.
    const rows = buildSubscriptionRoster([PAID, LAPSED], NOW)

    expect(summarizeRoster(rows).mrrPhp).toBe(649)
  })

  it('excludes tenants in grace from MRR as well', () => {
    // They are past their date and have not paid; grace bought them access,
    // not revenue.
    const rows = buildSubscriptionRoster([GRACE], NOW)

    expect(summarizeRoster(rows).mrrPhp).toBe(0)
  })

  it('counts everyone past their date as overdue, grace included', () => {
    const rows = buildSubscriptionRoster([PAID, GRACE, LAPSED], NOW)

    expect(summarizeRoster(rows).overduePhp).toBe(1298)
  })

  it('reports zeroes for an empty platform rather than throwing', () => {
    expect(summarizeRoster([])).toMatchObject({ total: 0, mrrPhp: 0, overduePhp: 0 })
  })
})

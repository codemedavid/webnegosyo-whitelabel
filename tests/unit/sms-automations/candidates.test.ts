/**
 * Who qualifies for each recipe, and under which occurrence key.
 *
 * The occurrence key is the whole dedupe story. A win-back is keyed on the
 * guest's LAST ORDER time: the same absence can only ever produce one text,
 * and ordering again starts a new absence (a new key) by itself. A review is
 * keyed on the order, a reward on the reward, a stamp nudge on the rung.
 */

import {
  guestCandidates,
  reviewCandidates,
  reviewCandidatesFromVisits,
  almostThereCandidates,
  rewardWaitingCandidates,
  rewardExpiringCandidates,
  type BalanceRow,
  type EntitlementRow,
} from '@/lib/sms-automations/candidates'
import type { GuestProfile } from '@/lib/sms-automations/types'
import type { LoyaltyRules } from '@/lib/loyalty/types'

const NOW = new Date('2026-10-12T04:00:00Z')
const DAY = 86_400_000
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString()
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()

function guest(id: string, overrides: Partial<GuestProfile> = {}): GuestProfile {
  return {
    id, name: `Guest ${id}`, phone: `+6391700000${id.padStart(2, '0')}`, smsConsent: true, smsOptOut: false,
    orderCount: 1, totalSpent: 300, firstOrderAt: ago(40), lastOrderAt: ago(40), favoriteItem: null, ...overrides,
  }
}

describe('win_back / regulars_gone_quiet', () => {
  const guests = [
    guest('1', { lastOrderAt: ago(31), orderCount: 1 }),  // just lapsed
    guest('2', { lastOrderAt: ago(10), orderCount: 5 }),  // still active
    guest('3', { lastOrderAt: ago(400), orderCount: 3 }), // gone too long to text out of nowhere
    guest('4', { lastOrderAt: null, orderCount: 0 }),     // never ordered
    guest('5', { lastOrderAt: ago(25), orderCount: 4 }),  // regular, quiet 25 days
  ]

  it('keys each absence on the last order, due the day the guest crossed the line', () => {
    const found = guestCandidates('win_back', { inactiveDays: 30 }, guests, NOW)
    expect(found.map((c) => c.guest.id)).toEqual(['1'])
    expect(found[0].occurrenceKey).toBe(`lapse:${guests[0].lastOrderAt}`)
    expect(found[0].dueAt).toBe(ago(1))
  })

  it('only counts regulars for "regulars gone quiet"', () => {
    const found = guestCandidates('regulars_gone_quiet', { inactiveDays: 21, minOrderCount: 3 }, guests, NOW)
    // Guest 1 lapsed but ordered once; guest 3 has been gone far too long.
    expect(found.map((c) => c.guest.id)).toEqual(['5'])
  })

  it('first-timers: one order, N days ago, never came back', () => {
    const firsts = [
      guest('6', { orderCount: 1, firstOrderAt: ago(6), lastOrderAt: ago(6) }),
      guest('7', { orderCount: 2, firstOrderAt: ago(6), lastOrderAt: ago(1) }),
      guest('8', { orderCount: 1, firstOrderAt: ago(2), lastOrderAt: ago(2) }),
    ]
    const found = guestCandidates('first_visit_followup', { delayDays: 5 }, firsts, NOW)
    expect(found.map((c) => c.guest.id)).toEqual(['6'])
    expect(found[0].occurrenceKey).toBe('first_visit')
  })
})

describe('review_request', () => {
  const guestsById = new Map([
    ['g1', guest('g1', { orderCount: 3 })],
    ['g2', guest('g2', { orderCount: 1 })],
  ])

  it('is due N hours after the order and keyed on it; first-timers skipped by default', () => {
    const orders = [
      { id: 'o1', customerId: 'g1', createdAt: hoursAgo(4) },
      { id: 'o2', customerId: 'g2', createdAt: hoursAgo(4) },
      { id: 'o3', customerId: 'g1', createdAt: hoursAgo(1) }, // not due yet
    ]
    const found = reviewCandidates({ delayHours: 3, minOrderCount: 2 }, orders, guestsById, NOW)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ occurrenceKey: 'order:o1', dueAt: hoursAgo(1) })
    // A review asked a day late is worse than none.
    expect(found[0].expiresAt).toBe(new Date(Date.parse(hoursAgo(1)) + DAY).toISOString())
  })

  it('falls back to the last visit when the store has no platform orders', () => {
    const found = reviewCandidatesFromVisits(
      { delayHours: 3, minOrderCount: 1 }, [guest('9', { lastOrderAt: hoursAgo(5) })], NOW,
    )
    expect(found[0].occurrenceKey).toBe(`visit:${hoursAgo(5)}`)
  })
})

describe('loyalty', () => {
  const rules: LoyaltyRules = {
    earnMode: 'stamp', threshold: 10, pointsPerPeso: null, minSpend: null,
    reward: { type: 'free_item', menuItemId: 'm1', itemName: 'Iced Tea' },
    milestones: [{ at: 5, reward: { type: 'fixed', amount: 50 } }],
    rewardExpiryDays: null, isExclusive: true,
  }
  const guestsById = new Map([['g1', guest('g1')]])

  it('almost there: the next rung, how far, keyed per program, card and rung', () => {
    const balances: BalanceRow[] = [
      { customerId: 'g1', programId: 'p1', balance: 8, cycle: 2, updatedAt: ago(2), rules },
    ]
    const [found] = almostThereCandidates({ remainingAtMost: 2, delayDays: 1 }, balances, guestsById, NOW)
    expect(found.occurrenceKey).toBe('step:p1:2:10')
    expect(found.loyalty).toMatchObject({ remaining: 2, progressLeft: '2 stamps', rewardName: 'Free Iced Tea' })
  })

  it('almost there: a milestone rung counts, and "1 stamp" is singular', () => {
    const [found] = almostThereCandidates(
      { remainingAtMost: 2, delayDays: 1 },
      [{ customerId: 'g1', programId: 'p1', balance: 4, cycle: 1, updatedAt: ago(2), rules }],
      guestsById, NOW,
    )
    expect(found.loyalty).toMatchObject({ progressLeft: '1 stamp', rewardName: 'P50 off' })
  })

  it('almost there: skips points programs and far-away guests', () => {
    const points: LoyaltyRules = { ...rules, earnMode: 'points', pointsPerPeso: 1, threshold: 500 }
    expect(almostThereCandidates({ remainingAtMost: 2, delayDays: 1 }, [
      { customerId: 'g1', programId: 'p1', balance: 499, cycle: 1, updatedAt: ago(2), rules: points },
      { customerId: 'g1', programId: 'p2', balance: 1, cycle: 1, updatedAt: ago(2), rules },
    ], guestsById, NOW)).toEqual([])
  })

  const entitlements: EntitlementRow[] = [
    { id: 'e1', customerKey: 'phone:+639170000001', issuedAt: ago(4), expiresAt: null,
      terms: { reward: { type: 'free_item', menuItemId: 'm1', itemName: 'Iced Tea' } } },
    { id: 'e2', customerKey: 'phone:+639170000001', issuedAt: ago(1), expiresAt: new Date(NOW.getTime() + 5 * DAY).toISOString(),
      terms: { reward: { type: 'fixed', amount: 50 } } },
    { id: 'e3', customerKey: 'email:a@b.c', issuedAt: ago(9), expiresAt: null,
      terms: { reward: { type: 'fixed', amount: 50 } } },
  ]
  const byPhone = new Map([['+639170000001', guest('1', { phone: '+639170000001' })]])

  it('reward waiting: unclaimed for N days, keyed on the reward, phone members only', () => {
    const found = rewardWaitingCandidates({ delayDays: 3 }, entitlements, byPhone, NOW)
    expect(found.map((c) => c.occurrenceKey)).toEqual(['reward:e1'])
    expect(found[0].entitlementId).toBe('e1')
  })

  it('reward expiring: within N days of the end, never after it', () => {
    const found = rewardExpiringCandidates({ delayDays: 7 }, entitlements, byPhone, NOW)
    expect(found.map((c) => c.occurrenceKey)).toEqual(['expiring:e2'])
    expect(found[0].expiresAt).toBe(entitlements[1].expiresAt)
    expect(found[0].loyalty?.rewardExpiresAt).toBe(entitlements[1].expiresAt)
  })
})

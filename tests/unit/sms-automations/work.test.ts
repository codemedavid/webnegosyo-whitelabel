/**
 * One automation + one store's data → who qualifies. The routing rules:
 *   - loyalty recipes need loyalty switched on for the store;
 *   - the review recipe reads real orders when the store's orders live on the
 *     platform, and falls back to each guest's last visit otherwise.
 */

import { candidatesFor, type StoreData } from '@/lib/sms-automations/work'
import type { AutomationRow, GuestProfile } from '@/lib/sms-automations/types'
import type { LoyaltyRules } from '@/lib/loyalty/types'

const NOW = new Date('2026-10-12T04:00:00Z')
const HOUR = 3_600_000
const DAY = 24 * HOUR
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

function guest(id: string, overrides: Partial<GuestProfile> = {}): GuestProfile {
  return {
    id, name: `Ana ${id}`, phone: `+63917000000${id}`, smsConsent: true, smsOptOut: false,
    orderCount: 3, totalSpent: 900, firstOrderAt: ago(90 * DAY), lastOrderAt: ago(4 * HOUR), favoriteItem: null, ...overrides,
  }
}

function automation(recipe: AutomationRow['recipe'], params: AutomationRow['params'] = {}): AutomationRow {
  return {
    id: `a-${recipe}`, tenant_id: 't1', recipe, name: recipe, params, message_template: 'Hi',
    run_mode: 'auto', reentry_days: null, status: 'on', source: 'owner', created_at: ago(0), updated_at: ago(0),
  }
}

const stampRules: LoyaltyRules = {
  earnMode: 'stamp', threshold: 8, pointsPerPeso: null, minSpend: null,
  reward: { type: 'fixed', amount: 50 }, rewardExpiryDays: null, isExclusive: true,
}

function data(overrides: Partial<StoreData> = {}): StoreData {
  return { guests: [], orders: null, balances: [], entitlements: [], loyaltyOn: true, ...overrides }
}

describe('candidatesFor', () => {
  it('asks for a review per order when the orders are on the platform', () => {
    const g = guest('1')
    const found = candidatesFor(automation('review_request'), data({
      guests: [g], orders: [{ id: 'o1', customerId: '1', createdAt: ago(4 * HOUR) }],
    }), NOW)
    expect(found.map((c) => c.occurrenceKey)).toEqual(['order:o1'])
  })

  it('falls back to the last visit when the orders live elsewhere', () => {
    const found = candidatesFor(automation('review_request'), data({ guests: [guest('1')], orders: null }), NOW)
    expect(found.map((c) => c.occurrenceKey)).toEqual([`visit:${ago(4 * HOUR)}`])
  })

  it('reads guest profiles for win-back', () => {
    const g = guest('1', { lastOrderAt: ago(31 * DAY) })
    expect(candidatesFor(automation('win_back'), data({ guests: [g] }), NOW)).toHaveLength(1)
  })

  it('finds stamp-card guests close to a reward', () => {
    const found = candidatesFor(automation('loyalty_almost_there'), data({
      guests: [guest('1')],
      balances: [{ customerId: '1', programId: 'p1', balance: 7, cycle: 0, updatedAt: ago(2 * DAY), rules: stampRules }],
    }), NOW)
    expect(found[0]?.loyalty?.progressLeft).toBe('1 stamp')
  })

  it('matches rewards to guests by phone', () => {
    const found = candidatesFor(automation('loyalty_reward_waiting'), data({
      guests: [guest('1')],
      entitlements: [{ id: 'e1', customerKey: 'phone:+639170000001', issuedAt: ago(4 * DAY), expiresAt: null, terms: { reward: { type: 'fixed', amount: 50 } } }],
    }), NOW)
    expect(found.map((c) => c.entitlementId)).toEqual(['e1'])
  })

  it('finds nothing for loyalty recipes when loyalty is off', () => {
    const found = candidatesFor(automation('loyalty_reward_waiting'), data({
      loyaltyOn: false,
      guests: [guest('1')],
      entitlements: [{ id: 'e1', customerKey: 'phone:+639170000001', issuedAt: ago(4 * DAY), expiresAt: null, terms: { reward: { type: 'fixed', amount: 50 } } }],
    }), NOW)
    expect(found).toEqual([])
  })
})

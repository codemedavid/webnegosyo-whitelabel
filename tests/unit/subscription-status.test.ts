/**
 * The gate that decides whether a merchant's admin and app are open.
 *
 * Every case here is a lockout decision, so the bias throughout is toward
 * LETTING A MERCHANT IN. A wrongly-open admin costs the platform a few days of
 * one subscription; a wrongly-closed one stops a restaurant taking orders.
 */

import {
  DEFAULT_GRACE_DAYS,
  resolveSubscriptionAccess,
  type SubscriptionRecord,
} from '@/lib/billing/subscription-status'

/** 2026-08-10, mid-afternoon Manila (07:00Z = 15:00 +08:00). */
const NOW = '2026-08-10T07:00:00.000Z'

function subscription(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    status: 'active',
    paid_through: '2026-08-31',
    grace_days: DEFAULT_GRACE_DAYS,
    ...overrides,
  }
}

describe('resolveSubscriptionAccess', () => {
  describe('inside the paid period', () => {
    it('is active when the paid-through date is still ahead', () => {
      // Arrange
      const sub = subscription({ paid_through: '2026-08-31' })

      // Act
      const access = resolveSubscriptionAccess(sub, NOW)

      // Assert
      expect(access).toMatchObject({ state: 'active', isBlocked: false, daysOverdue: 0 })
    })

    it('is still active on the paid-through date itself', () => {
      // The merchant paid THROUGH that day, so it is theirs in full.
      const sub = subscription({ paid_through: '2026-08-10' })

      const access = resolveSubscriptionAccess(sub, NOW)

      expect(access).toMatchObject({ state: 'active', isBlocked: false, daysOverdue: 0 })
    })

    it('is active at 23:59 Manila on the paid-through date', () => {
      // 15:59Z on the 10th is 23:59 Manila the same day. A UTC-based comparison
      // would have already rolled to the 11th and locked the merchant out eight
      // hours early, in the middle of dinner service.
      const sub = subscription({ paid_through: '2026-08-10' })

      const access = resolveSubscriptionAccess(sub, '2026-08-10T15:59:00.000Z')

      expect(access.isBlocked).toBe(false)
    })

    it('is already past due at 00:01 Manila the next day', () => {
      // 16:01Z on the 10th is 00:01 Manila on the 11th — the other side of the
      // same boundary, proving the cut is Manila midnight and not UTC midnight.
      const sub = subscription({ paid_through: '2026-08-10' })

      const access = resolveSubscriptionAccess(sub, '2026-08-10T16:01:00.000Z')

      expect(access).toMatchObject({ state: 'grace', daysOverdue: 1 })
    })
  })

  describe('inside the grace window', () => {
    it('grants grace on the first day past due', () => {
      const sub = subscription({ paid_through: '2026-08-09' })

      const access = resolveSubscriptionAccess(sub, NOW)

      expect(access).toMatchObject({ state: 'grace', isBlocked: false, daysOverdue: 1 })
    })

    it('still grants grace on the last day of the window', () => {
      // Three grace days after the 7th means the 8th, 9th and 10th are covered.
      const sub = subscription({ paid_through: '2026-08-07', grace_days: 3 })

      const access = resolveSubscriptionAccess(sub, NOW)

      expect(access).toMatchObject({ state: 'grace', isBlocked: false, daysOverdue: 3 })
    })

    it('blocks the day after the grace window closes', () => {
      const sub = subscription({ paid_through: '2026-08-06', grace_days: 3 })

      const access = resolveSubscriptionAccess(sub, NOW)

      expect(access).toMatchObject({ state: 'paused', isBlocked: true, daysOverdue: 4 })
    })

    it('reports the day access will stop, so the merchant can be warned', () => {
      const sub = subscription({ paid_through: '2026-08-09', grace_days: 3 })

      const access = resolveSubscriptionAccess(sub, NOW)

      expect(access.blockedFromDayKey).toBe('2026-08-13')
    })

    it('treats a missing grace_days as the platform default', () => {
      const sub = subscription({ paid_through: '2026-08-07', grace_days: null })

      const access = resolveSubscriptionAccess(sub, NOW)

      expect(access).toMatchObject({ state: 'grace', isBlocked: false })
    })

    it('treats a negative grace_days as no grace at all', () => {
      // A nonsense value must not be arithmetic that extends access backwards.
      const sub = subscription({ paid_through: '2026-08-09', grace_days: -5 })

      const access = resolveSubscriptionAccess(sub, NOW)

      expect(access).toMatchObject({ state: 'paused', isBlocked: true })
    })
  })

  describe('explicit statuses override the dates', () => {
    it('blocks a cancelled subscription even while paid through a future date', () => {
      // Cancelling is a deliberate act by the platform owner; a paid-through
      // date left over from the last payment must not undo it.
      const sub = subscription({ status: 'cancelled', paid_through: '2026-12-31' })

      const access = resolveSubscriptionAccess(sub, NOW)

      expect(access).toMatchObject({ state: 'paused', isBlocked: true })
    })

    it('blocks a manually paused subscription', () => {
      const sub = subscription({ status: 'paused', paid_through: '2026-12-31' })

      const access = resolveSubscriptionAccess(sub, NOW)

      expect(access.isBlocked).toBe(true)
    })

    it('does not block a trialing subscription that is paid through a future date', () => {
      const sub = subscription({ status: 'trialing', paid_through: '2026-08-31' })

      const access = resolveSubscriptionAccess(sub, NOW)

      expect(access).toMatchObject({ state: 'active', isBlocked: false })
    })

    it('applies the date rules to a past_due row rather than trusting the label', () => {
      // `status` is a stored summary that a cron or a human may have written
      // days ago. The dates are the truth; a row stamped past_due but since paid
      // through the end of the month is open.
      const sub = subscription({ status: 'past_due', paid_through: '2026-08-31' })

      const access = resolveSubscriptionAccess(sub, NOW)

      expect(access).toMatchObject({ state: 'active', isBlocked: false })
    })
  })

  describe('rows that predate billing', () => {
    it('never blocks a tenant with no subscription row at all', () => {
      // Every tenant that existed before this feature has no row. Reading that
      // absence as non-payment would black out the entire platform on deploy.
      const access = resolveSubscriptionAccess(null, NOW)

      expect(access).toMatchObject({ state: 'active', isBlocked: false })
    })

    it('never blocks a subscription with no paid-through date set', () => {
      // No due date means nobody has said when payment is owed. That is an
      // unconfigured account, not a delinquent one.
      const sub = subscription({ paid_through: null })

      const access = resolveSubscriptionAccess(sub, NOW)

      expect(access).toMatchObject({ state: 'active', isBlocked: false })
    })

    it('never blocks on an unparseable paid-through value', () => {
      const sub = subscription({ paid_through: 'not-a-date' })

      const access = resolveSubscriptionAccess(sub, NOW)

      expect(access).toMatchObject({ state: 'active', isBlocked: false })
    })

    it('never blocks on an unparseable clock reading', () => {
      const access = resolveSubscriptionAccess(subscription({ paid_through: '2020-01-01' }), 'nope')

      expect(access.isBlocked).toBe(false)
    })
  })

  describe('reporting for the paused screen', () => {
    it('carries the due date through so the screen can state what is owed', () => {
      const sub = subscription({ paid_through: '2026-08-06' })

      const access = resolveSubscriptionAccess(sub, NOW)

      expect(access.paidThroughDayKey).toBe('2026-08-06')
    })

    it('counts days overdue across a month boundary', () => {
      const sub = subscription({ paid_through: '2026-07-31', grace_days: 3 })

      const access = resolveSubscriptionAccess(sub, NOW)

      expect(access.daysOverdue).toBe(10)
    })
  })
})

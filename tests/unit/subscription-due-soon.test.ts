/**
 * "Who has to pay me this week?"
 *
 * The collections screen already ranks the people who are LATE. This covers the
 * other half of the question the platform owner actually asks: who is about to
 * come due, so they can be chased BEFORE their admin goes dark rather than
 * after. A renewal warned about on the day it lapses has already cost the
 * merchant a morning of service and the platform a support call.
 *
 * `daysUntilDue` lives on the shared access verdict rather than being
 * recomputed on the collections screen, for the same reason `daysOverdue` does:
 * three surfaces read this subscription and they must not each hold their own
 * opinion about what day it is.
 */

import { resolveSubscriptionAccess } from '@/lib/billing/subscription-status'
import {
  DUE_SOON_WINDOW_DAYS,
  buildSubscriptionRoster,
  summarizeRoster,
} from '@/lib/billing/subscription-roster'

/** 2026-08-10, mid-afternoon Manila (07:00Z = 15:00 +08:00). */
const NOW = '2026-08-10T07:00:00.000Z'

describe('resolveSubscriptionAccess — daysUntilDue', () => {
  it('counts the whole days left before the paid period ends', () => {
    // Arrange
    const sub = { status: 'active', paid_through: '2026-08-17', grace_days: 3 }

    // Act
    const access = resolveSubscriptionAccess(sub, NOW)

    // Assert
    expect(access.daysUntilDue).toBe(7)
  })

  it('reports zero on the last paid day, not one', () => {
    // Paid THROUGH today means today is theirs and tomorrow is not. Calling
    // that "1 day left" would tell the owner to chase them tomorrow, which is
    // the day the merchant is already in grace.
    const access = resolveSubscriptionAccess(
      { status: 'active', paid_through: '2026-08-10', grace_days: 3 },
      NOW
    )

    expect(access.daysUntilDue).toBe(0)
  })

  it('is null once the date has passed, because overdue is the fact that matters', () => {
    const access = resolveSubscriptionAccess(
      { status: 'active', paid_through: '2026-08-09', grace_days: 3 },
      NOW
    )

    expect(access.daysUntilDue).toBeNull()
  })

  it('is null for a tenant with no due date at all', () => {
    const access = resolveSubscriptionAccess({ status: 'active', paid_through: null }, NOW)

    expect(access.daysUntilDue).toBeNull()
  })

  it('is null for a manually paused tenant whatever their stored date says', () => {
    // A tenant the owner cut off is not "renewing in 20 days"; they owe now.
    const access = resolveSubscriptionAccess(
      { status: 'paused', paid_through: '2026-08-30', grace_days: 3 },
      NOW
    )

    expect(access.daysUntilDue).toBeNull()
  })

  it('is null when there is no subscription row, alongside the open verdict', () => {
    expect(resolveSubscriptionAccess(null, NOW).daysUntilDue).toBeNull()
  })
})

const PAUSED = { tenantId: 't-paused', name: 'Delta Deli', slug: 'delta', paidThrough: '2026-05-01' }
const GRACE = { tenantId: 't-grace', name: 'Bravo Grill', slug: 'bravo', paidThrough: '2026-08-09' }
const DUE_IN_2 = { tenantId: 't-2d', name: 'Echo Eatery', slug: 'echo', paidThrough: '2026-08-12' }
const DUE_IN_7 = { tenantId: 't-7d', name: 'Alpha Cafe', slug: 'alpha', paidThrough: '2026-08-17' }
const COMFORTABLE = { tenantId: 't-far', name: 'Foxtrot Fry', slug: 'foxtrot', paidThrough: '2026-09-30' }

describe('buildSubscriptionRoster — the seven-day window', () => {
  it('uses a seven-day window', () => {
    // Named so the screen and the tests cannot disagree about "this week".
    expect(DUE_SOON_WINDOW_DAYS).toBe(7)
  })

  it('flags a tenant coming due inside the window', () => {
    // Arrange / Act
    const [row] = buildSubscriptionRoster([DUE_IN_2], NOW)

    // Assert
    expect(row).toMatchObject({ state: 'active', isDueSoon: true, daysUntilDue: 2 })
  })

  it('includes the seventh day itself, so a full week is really a full week', () => {
    const [row] = buildSubscriptionRoster([DUE_IN_7], NOW)

    expect(row).toMatchObject({ isDueSoon: true, daysUntilDue: 7 })
  })

  it('does not flag a tenant paid well beyond the window', () => {
    const [row] = buildSubscriptionRoster([COMFORTABLE], NOW)

    expect(row).toMatchObject({ isDueSoon: false, daysUntilDue: 51 })
  })

  it('does not flag an overdue tenant as due soon — they are already late', () => {
    // Both need chasing, but they are different conversations: one is a
    // reminder, the other is a collection.
    const [row] = buildSubscriptionRoster([GRACE], NOW)

    expect(row.isDueSoon).toBe(false)
  })

  it('ranks the about-to-lapse above the comfortably paid', () => {
    // Arrange / Act
    const rows = buildSubscriptionRoster([COMFORTABLE, DUE_IN_7, DUE_IN_2], NOW)

    // Assert
    expect(rows.map((r) => r.tenantId)).toEqual(['t-2d', 't-7d', 't-far'])
  })

  it('still ranks everyone already overdue above everyone merely due soon', () => {
    // Money owed outranks money expected. `DUE_IN_2` sorts before `GRACE`
    // alphabetically and has fewer days on the clock, so only the state
    // ordering can produce this.
    const rows = buildSubscriptionRoster([DUE_IN_2, GRACE, PAUSED], NOW)

    expect(rows.map((r) => r.tenantId)).toEqual(['t-paused', 't-grace', 't-2d'])
  })

  it('never flags a tenant with no due date, rather than treating it as due today', () => {
    // An unconfigured account is not a renewal. Sorting it into this week's
    // chase list would put the owner on the phone about a bill nobody set.
    const [row] = buildSubscriptionRoster(
      [{ tenantId: 't-new', name: 'New Co', slug: 'new', paidThrough: null }],
      NOW
    )

    expect(row).toMatchObject({ isDueSoon: false, daysUntilDue: null })
  })
})

describe('summarizeRoster — the seven-day figures', () => {
  it('counts the tenants coming due this week', () => {
    const rows = buildSubscriptionRoster([DUE_IN_2, DUE_IN_7, COMFORTABLE, GRACE], NOW)

    expect(summarizeRoster(rows).dueSoon).toBe(2)
  })

  it('totals the money expected to land this week', () => {
    const rows = buildSubscriptionRoster([DUE_IN_2, DUE_IN_7, COMFORTABLE], NOW)

    expect(summarizeRoster(rows).dueSoonPhp).toBe(1298)
  })

  it('honours a negotiated price in the expected total', () => {
    const rows = buildSubscriptionRoster([{ ...DUE_IN_2, monthlyPricePhp: 1200 }], NOW)

    expect(summarizeRoster(rows).dueSoonPhp).toBe(1200)
  })

  it('keeps the due-soon total apart from the overdue total', () => {
    // The two must never be added together on the screen: one is a forecast,
    // the other is a debt, and a single blended number would let the owner
    // believe money already owed is money still on schedule.
    const summary = summarizeRoster(buildSubscriptionRoster([DUE_IN_2, GRACE], NOW))

    expect(summary).toMatchObject({ dueSoonPhp: 649, overduePhp: 649 })
  })

  it('still counts a due-soon tenant in MRR, because they are current', () => {
    const summary = summarizeRoster(buildSubscriptionRoster([DUE_IN_2], NOW))

    expect(summary).toMatchObject({ active: 1, mrrPhp: 649 })
  })

  it('reports zeroes for an empty platform rather than throwing', () => {
    expect(summarizeRoster([])).toMatchObject({ dueSoon: 0, dueSoonPhp: 0 })
  })
})

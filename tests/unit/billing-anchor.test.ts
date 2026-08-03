/**
 * Which period a payment buys, once a client has a billing anchor.
 *
 * The anchor is the date the platform owner says the client's month turns over
 * — "they started on the 1st". Without one, billing works exactly as it did
 * before: a lapsed merchant's month starts the day they pay. That fallback is
 * asserted here as hard as the new behaviour, because every tenant already on
 * the platform has no anchor and must not notice this shipped.
 *
 * The rule the anchor buys is that the turnover date never drifts. A merchant
 * anchored to the 1st who pays late on the 20th is buying the month they have
 * already been using, not a fresh month starting on the 20th.
 *
 * Start and end are decided together, never separately. An anchored period ends
 * the day before the next anchor date, so consecutive periods tile exactly:
 * deriving the end from the start instead would let a 31st anchor sell 28
 * February as both the end of one month and the start of the next.
 */

import { resolveAnchoredPeriod, resolvePeriodEnd } from '@/lib/billing/billing-anchor'

/** One month, the only period this platform actually sells. */
const ONE_MONTH = 1

describe('resolveAnchoredPeriod', () => {
  describe('without an anchor — today’s behaviour, unchanged', () => {
    it('starts a lapsed merchant today', () => {
      // Arrange
      const anchor = null
      const paidThrough = '2026-07-31'

      // Act
      const period = resolveAnchoredPeriod(anchor, paidThrough, '2026-08-10', ONE_MONTH)

      // Assert
      expect(period).toEqual({ periodStart: '2026-08-10', periodEnd: '2026-09-09' })
    })

    it('starts a never-billed tenant today', () => {
      const period = resolveAnchoredPeriod(null, null, '2026-08-10', ONE_MONTH)

      expect(period).toEqual({ periodStart: '2026-08-10', periodEnd: '2026-09-09' })
    })

    it('stacks onto a period still running', () => {
      const period = resolveAnchoredPeriod(null, '2026-08-31', '2026-08-10', ONE_MONTH)

      expect(period).toEqual({ periodStart: '2026-09-01', periodEnd: '2026-09-30' })
    })

    it('does not shorten an unanchored month that clamped', () => {
      // 31 January plus a month is 28 February; the clamp already consumed the
      // boundary, so subtracting another day would sell a 28-day month.
      const period = resolveAnchoredPeriod(null, '2026-01-30', '2026-01-15', ONE_MONTH)

      expect(period).toEqual({ periodStart: '2026-01-31', periodEnd: '2026-02-28' })
    })
  })

  describe('with an anchor, when nothing is currently paid', () => {
    it('bills the month the merchant is already living in', () => {
      // Anchored to the 1st, recorded on the 10th, never billed. The month in
      // front of them is 1–31 August. Starting on the 10th would charge a full
      // month for 22 days and shove the turnover to the 10th forever.
      const period = resolveAnchoredPeriod('2026-08-01', null, '2026-08-10', ONE_MONTH)

      expect(period).toEqual({ periodStart: '2026-08-01', periodEnd: '2026-08-31' })
    })

    it('starts on the anchor when the anchor is still ahead', () => {
      // A client signed up today to begin on the 1st of next month. Their first
      // month is that one, not a stub of the current month.
      const period = resolveAnchoredPeriod('2026-09-01', null, '2026-08-10', ONE_MONTH)

      expect(period).toEqual({ periodStart: '2026-09-01', periodEnd: '2026-09-30' })
    })

    it('starts on the anchor when today is the anchor', () => {
      const period = resolveAnchoredPeriod('2026-08-01', null, '2026-08-01', ONE_MONTH)

      expect(period.periodStart).toBe('2026-08-01')
    })

    it('keeps the turnover date when a lapsed merchant pays late', () => {
      // The headline case. Anchored in January, paid through August, recorded
      // on 20 September: they buy September, and October still falls due on the
      // 1st. Starting from today would slide every future renewal to the 20th.
      const period = resolveAnchoredPeriod('2026-01-01', '2026-08-31', '2026-09-20', ONE_MONTH)

      expect(period).toEqual({ periodStart: '2026-09-01', periodEnd: '2026-09-30' })
    })

    it('does not sell back the months a lapsed merchant skipped', () => {
      // Six months lapsed. They owe a conversation, not six invoices; this
      // sells them the month in front of them and nothing behind it.
      const period = resolveAnchoredPeriod('2026-01-15', '2026-03-14', '2026-09-20', ONE_MONTH)

      expect(period).toEqual({ periodStart: '2026-09-15', periodEnd: '2026-10-14' })
    })

    it('rolls forward across a year boundary', () => {
      const period = resolveAnchoredPeriod('2025-11-01', null, '2027-02-14', ONE_MONTH)

      expect(period).toEqual({ periodStart: '2027-02-01', periodEnd: '2027-02-28' })
    })

    it('stays on the previous turnover when today is before this month’s', () => {
      // Anchored to the 15th, recorded on the 3rd: the period they are inside
      // began on 15 September, not 15 October.
      const period = resolveAnchoredPeriod('2026-01-15', null, '2026-10-03', ONE_MONTH)

      expect(period.periodStart).toBe('2026-09-15')
    })

    it('honours a multi-month payment on the anchor grid', () => {
      const period = resolveAnchoredPeriod('2026-08-01', null, '2026-08-10', 3)

      expect(period).toEqual({ periodStart: '2026-08-01', periodEnd: '2026-10-31' })
    })
  })

  describe('a 31st anchor, where the calendar fights back', () => {
    it('returns to the 31st rather than carrying February’s clamp forward', () => {
      // Every period is computed from the anchor itself, not from the last
      // clamped result, so a short month bends the grid for one month only.
      const period = resolveAnchoredPeriod('2026-01-31', null, '2026-05-31', ONE_MONTH)

      expect(period.periodStart).toBe('2026-05-31')
    })

    it('tiles a clamped month without selling a day twice', () => {
      // 31 January's period runs to 27 February, because 28 February is where
      // the next one starts. An end derived from the start would return the
      // 28th for both and charge one day to two months.
      const january = resolveAnchoredPeriod('2026-01-31', null, '2026-02-20', ONE_MONTH)
      const february = resolveAnchoredPeriod('2026-01-31', null, '2026-02-28', ONE_MONTH)

      expect(january).toEqual({ periodStart: '2026-01-31', periodEnd: '2026-02-27' })
      expect(february.periodStart).toBe('2026-02-28')
    })
  })

  describe('stacking beats the anchor', () => {
    it('picks up the day after a period that is still running', () => {
      const period = resolveAnchoredPeriod('2026-08-01', '2026-08-31', '2026-08-10', ONE_MONTH)

      expect(period).toEqual({ periodStart: '2026-09-01', periodEnd: '2026-09-30' })
    })

    it('stacks on the last paid day itself', () => {
      // Paid THROUGH the 31st means the 31st is theirs, so paying on the 31st
      // still stacks rather than restarting.
      const period = resolveAnchoredPeriod('2026-08-01', '2026-08-31', '2026-08-31', ONE_MONTH)

      expect(period.periodStart).toBe('2026-09-01')
    })

    it('realigns an off-grid merchant by comping the stub, never by billing it', () => {
      // Anchor set to the 1st on a client whose paid-through sits mid-month.
      // The new period starts the day after their paid days end — no gap in the
      // ledger — and runs to the end of the next whole anchored month. They get
      // the stub free. Charging ₱649 for a five-day realignment stub is the one
      // outcome a merchant would rightly complain about.
      const period = resolveAnchoredPeriod('2026-08-01', '2026-09-10', '2026-09-01', ONE_MONTH)

      expect(period).toEqual({ periodStart: '2026-09-11', periodEnd: '2026-10-31' })
    })
  })

  describe('refusing to trust a bad anchor', () => {
    it('ignores an unparseable anchor and falls back to today', () => {
      // A corrupt anchor must never block a payment being recorded. Falling
      // back is the same bias the access gate takes: uncertainty resolves in
      // the merchant's favour.
      const period = resolveAnchoredPeriod('not-a-date', null, '2026-08-10', ONE_MONTH)

      expect(period.periodStart).toBe('2026-08-10')
    })

    it('ignores an impossible calendar date', () => {
      const period = resolveAnchoredPeriod('2026-02-31', null, '2026-08-10', ONE_MONTH)

      expect(period.periodStart).toBe('2026-08-10')
    })
  })
})

describe('resolvePeriodEnd', () => {
  it('ends the day before the same date next month', () => {
    // Consecutive periods tile without a day belonging to two of them.
    expect(resolvePeriodEnd('2026-08-01', 1)).toBe('2026-08-31')
  })

  it('ends a multi-month period', () => {
    expect(resolvePeriodEnd('2026-08-01', 3)).toBe('2026-10-31')
  })

  it('does not shorten a month that clamped', () => {
    expect(resolvePeriodEnd('2026-01-31', 1)).toBe('2026-02-28')
  })
})

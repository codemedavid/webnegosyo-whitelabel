/**
 * The two dates the collections screen shows about when a client began.
 *
 * They are different facts and the owner needs both. JOINED is when the store
 * was created on the platform — it never changes and answers "how long have we
 * had them". BILLING SINCE is the anchor the owner sets, and answers "which
 * month does their money buy". A client can have joined in March and be
 * anchored to August because that is when they started paying.
 *
 * Joined is a timestamp in the database and a calendar date on the screen, so
 * it is converted on the Manila boundary the rest of the platform uses. A store
 * created at 9pm Manila was created that evening, not the next morning.
 */

import { buildSubscriptionRoster } from '@/lib/billing/subscription-roster'

const NOW = '2026-08-10T07:00:00.000Z'

const BASE = {
  tenantId: 't1',
  name: 'Alpha Cafe',
  slug: 'alpha',
  status: 'active',
  paidThrough: '2026-08-31',
}

function firstRow(input: Partial<typeof BASE> & Record<string, unknown>) {
  return buildSubscriptionRoster([{ ...BASE, ...input }], NOW)[0]
}

describe('the roster carries both start dates', () => {
  it('reports the day the tenant joined the platform', () => {
    // Arrange
    const joinedAt = '2026-03-12T04:00:00.000Z'

    // Act
    const row = firstRow({ joinedAt })

    // Assert
    expect(row.joinedDayKey).toBe('2026-03-12')
  })

  it('reads the joined date on the Manila boundary, not UTC', () => {
    // 9pm Manila on the 12th is already the 13th in UTC. A store created that
    // evening must not read as having joined the next day.
    const row = firstRow({ joinedAt: '2026-03-12T13:30:00.000Z' })

    expect(row.joinedDayKey).toBe('2026-03-12')
  })

  it('reports the billing anchor separately from the joined date', () => {
    const row = firstRow({
      joinedAt: '2026-03-12T04:00:00.000Z',
      billingAnchorDate: '2026-08-01',
    })

    expect(row.joinedDayKey).toBe('2026-03-12')
    expect(row.anchorDayKey).toBe('2026-08-01')
  })

  it('reports no anchor as null rather than inventing one', () => {
    // An unanchored client bills from the day they pay. Showing the joined date
    // in this column would claim a turnover date the billing does not honour.
    const row = firstRow({ joinedAt: '2026-03-12T04:00:00.000Z' })

    expect(row.anchorDayKey).toBeNull()
  })

  it('survives a missing joined date', () => {
    const row = firstRow({})

    expect(row.joinedDayKey).toBeNull()
  })

  it('survives an unparseable joined date without throwing', () => {
    // This screen's one job is listing who owes money. A single corrupt
    // timestamp must not take the whole collections table down with it.
    const row = firstRow({ joinedAt: 'not-a-timestamp' })

    expect(row.joinedDayKey).toBeNull()
    expect(row.name).toBe('Alpha Cafe')
  })

  it('ignores an unparseable anchor rather than displaying it', () => {
    // The period arithmetic silently ignores a junk anchor, so showing it would
    // promise a turnover date that billing does not keep.
    const row = firstRow({ billingAnchorDate: '2026-02-31' })

    expect(row.anchorDayKey).toBeNull()
  })
})

import {
  EMPTY_LEDGER_FILTER,
  cashierOptions,
  filterGrants,
  latestVerdict,
  needsALook,
  visibleFlags,
} from '@/lib/gov-discount-reports/review-queue'
import { grantEntry, review } from '../../fixtures/gov-discount-claims'

describe('needsALook', () => {
  it('keeps unreviewed, standing grants with a high or medium flag, newest first', () => {
    const high = grantEntry({ flags: ['amount_mismatch'], occurredAt: '2026-10-01T00:00:00.000Z' })
    const medium = grantEntry({ flags: ['id_reused_today'], occurredAt: '2026-10-03T00:00:00.000Z' })
    const lowOnly = grantEntry({ flags: ['self_approved', 'edited'] })
    const clean = grantEntry()

    expect(needsALook([high, lowOnly, medium, clean]).map((grant) => grant.id)).toEqual([medium.id, high.id])
  })

  it('drops grants already reviewed or taken back', () => {
    const reviewed = grantEntry({ flags: ['approval_missing'] })
    const withReview = { ...reviewed, reviews: [review({ claimId: reviewed.id })] }
    const reversed = grantEntry({ flags: ['approval_missing'], reversedAt: '2026-10-05T00:00:00.000Z' })
    expect(needsALook([withReview, reversed])).toEqual([])
  })
})

describe('needsALook — take-backs nobody could confirm', () => {
  it('keeps a reversed grant whose take-back was not confirmed, until reviewed', () => {
    const unconfirmed = grantEntry({ flags: ['reversal_unverified'], reversedAt: '2026-10-05T00:00:00.000Z' })
    const reviewed = { ...unconfirmed, id: 'reviewed', reviews: [review({ claimId: unconfirmed.id })] }
    expect(needsALook([unconfirmed, reviewed]).map((grant) => grant.id)).toEqual([unconfirmed.id])
  })
})

describe('visibleFlags', () => {
  it('gives each flag the engine’s label, explanation and severity', () => {
    expect(visibleFlags(['amount_mismatch'])).toEqual([
      expect.objectContaining({ flag: 'amount_mismatch', label: 'Amount differs', severity: 'high' }),
    ])
  })
})

describe('latestVerdict', () => {
  it('reads the newest review, or null', () => {
    const grant = grantEntry()
    expect(latestVerdict(grant)).toBeNull()
    expect(latestVerdict({ reviews: [review({ claimId: grant.id, verdict: 'problem' })] })).toBe('problem')
  })
})

describe('filterGrants', () => {
  const senior = grantEntry({ kind: 'senior', claimantName: 'Lola Remedios', idNumber: '12-3456', grantedByName: 'Ana' })
  const pwd = grantEntry({
    kind: 'pwd',
    claimantName: 'Pedro Santos',
    idNumber: '13-7404-000-0001234',
    grantedByName: 'Ben',
    flags: ['unusual_id'],
    orderLabel: '#77',
  })
  const all = [senior, pwd]

  it('returns everything with the empty filter', () => {
    expect(filterGrants(all, EMPTY_LEDGER_FILTER)).toHaveLength(2)
  })

  it('filters by kind, cashier and flagged-only', () => {
    expect(filterGrants(all, { ...EMPTY_LEDGER_FILTER, kind: 'pwd' })).toEqual([pwd])
    expect(filterGrants(all, { ...EMPTY_LEDGER_FILTER, cashier: 'Ana' })).toEqual([senior])
    expect(filterGrants(all, { ...EMPTY_LEDGER_FILTER, flaggedOnly: true })).toEqual([pwd])
  })

  it('searches the name case-insensitively and the ID ignoring dashes and spaces', () => {
    expect(filterGrants(all, { ...EMPTY_LEDGER_FILTER, query: 'remedios' })).toEqual([senior])
    expect(filterGrants(all, { ...EMPTY_LEDGER_FILTER, query: '0001234' })).toEqual([pwd])
    expect(filterGrants(all, { ...EMPTY_LEDGER_FILTER, query: '13 7404' })).toEqual([pwd])
    expect(filterGrants(all, { ...EMPTY_LEDGER_FILTER, query: '#77' })).toEqual([pwd])
    expect(filterGrants(all, { ...EMPTY_LEDGER_FILTER, query: 'nobody' })).toEqual([])
  })

  it('does not match every ID when the query has no letters or digits', () => {
    expect(filterGrants(all, { ...EMPTY_LEDGER_FILTER, query: '--' })).toEqual([])
  })
})

describe('cashierOptions', () => {
  it('lists each cashier once, alphabetically', () => {
    const grants = [grantEntry({ grantedByName: 'Ben' }), grantEntry({ grantedByName: 'Ana' }), grantEntry({ grantedByName: 'Ben' })]
    expect(cashierOptions(grants)).toEqual(['Ana', 'Ben'])
  })
})

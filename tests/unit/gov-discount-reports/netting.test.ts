import {
  cashierAttribution,
  grantsWithStatus,
  groupTotals,
  reviewsByClaim,
  signOf,
  sumClaims,
  twinKey,
} from '@/lib/gov-discount-reports/netting'
import { claim, reversalOf, review } from '../../fixtures/gov-discount-claims'

describe('sumClaims', () => {
  it('adds grants and subtracts their reversals', () => {
    const kept = claim()
    const cancelled = claim()
    const totals = sumClaims([kept, cancelled, reversalOf(cancelled)])

    expect(totals).toEqual({
      sales: 1,
      grossShare: 112,
      vatRemoved: 12,
      vatExemptSales: 100,
      discount: 20,
      netDue: 80,
      reduction: 32,
    })
  })

  it('nets an edit (reverse revision 0, grant revision 1) to the new amount once', () => {
    const first = claim({ revision: 0, reduction: 32 })
    const edited = claim({ externalOrderId: first.externalOrderId, revision: 1, reduction: 40, discount: 28 })
    const totals = sumClaims([first, reversalOf(first), edited])
    expect(totals.sales).toBe(1)
    expect(totals.reduction).toBe(40)
    expect(totals.discount).toBe(28)
  })

  it('goes negative when only the reversal falls inside the window', () => {
    const lastMonth = claim()
    expect(sumClaims([reversalOf(lastMonth)])).toMatchObject({ sales: -1, reduction: -32 })
  })

  it('sums in centavos so tenths of a centavo cannot drift', () => {
    const rows = Array.from({ length: 10 }, () => claim({ reduction: 0.1, discount: 0.1 }))
    expect(sumClaims(rows).reduction).toBe(1)
    expect(sumClaims([]).reduction).toBe(0)
  })
})

describe('signOf and twinKey', () => {
  it('pairs a reversal with its grant', () => {
    const grant = claim()
    const reversal = reversalOf(grant)
    expect(twinKey(reversal)).toBe(twinKey(grant))
    expect(signOf(grant)).toBe(1)
    expect(signOf(reversal)).toBe(-1)
  })

  it('does not pair different claimants or revisions on one order', () => {
    const grant = claim()
    expect(twinKey({ ...grant, claimantRef: 'c2' })).not.toBe(twinKey(grant))
    expect(twinKey({ ...grant, revision: 1 })).not.toBe(twinKey(grant))
  })
})

describe('groupTotals', () => {
  it('orders groups by the amount taken off, largest first', () => {
    const rows = [claim({ kind: 'pwd', reduction: 10 }), claim({ kind: 'senior', reduction: 50 }), claim({ kind: 'pwd', reduction: 60 })]
    const groups = groupTotals(rows, (row) => row.kind, (key) => key.toUpperCase())
    expect(groups.map((group) => [group.key, group.totals.reduction, group.totals.sales])).toEqual([
      ['pwd', 70, 2],
      ['senior', 50, 1],
    ])
    expect(groups[0].label).toBe('PWD')
  })
})

describe('cashierAttribution', () => {
  it('charges a reversal to the cashier who gave the discount, not the one who took it back', () => {
    const grant = claim({ grantedByName: 'Ana' })
    const reversal = reversalOf(grant, { grantedByName: 'Manager Ben' })
    const attribute = cashierAttribution([grant, reversal])
    expect(attribute(reversal)).toBe('Ana')

    const groups = groupTotals([grant, reversal], attribute, (key) => key)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ key: 'Ana', totals: { sales: 0, reduction: 0 } })
  })

  it('falls back to the reverser when the grant is outside the window', () => {
    const reversal = reversalOf(claim({ grantedByName: 'Ana' }), { grantedByName: 'Ben' })
    expect(cashierAttribution([reversal])(reversal)).toBe('Ben')
  })
})

describe('grantsWithStatus', () => {
  it('lists only grants, newest first, marked with when they were taken back', () => {
    const older = claim({ occurredAt: '2026-10-01T01:00:00.000Z' })
    const newer = claim({ occurredAt: '2026-10-03T01:00:00.000Z' })
    const reversal = reversalOf(older, { occurredAt: '2026-10-02T01:00:00.000Z' })

    const grants = grantsWithStatus([older, reversal, newer], [], [])
    expect(grants.map((grant) => grant.id)).toEqual([newer.id, older.id])
    expect(grants[1].reversedAt).toBe('2026-10-02T01:00:00.000Z')
    expect(grants[0].reversedAt).toBeNull()
  })

  it('sees a reversal recorded after the window', () => {
    const grant = claim()
    const later = { ...reversalOf(grant), occurredAt: '2026-11-02T00:00:00.000Z' }
    expect(grantsWithStatus([grant], [later], [])[0].reversedAt).toBe('2026-11-02T00:00:00.000Z')
  })

  it('attaches each grant its own reviews, newest first', () => {
    const grant = claim()
    const other = claim()
    const first = review({ claimId: grant.id, createdAt: '2026-10-06T00:00:00.000Z' })
    const second = review({ claimId: grant.id, verdict: 'problem', note: 'Check ID', createdAt: '2026-10-07T00:00:00.000Z' })
    const grants = grantsWithStatus([grant, other], [], [first, second, review({ claimId: 'not-in-window' })])

    const withReviews = grants.find((entry) => entry.id === grant.id)
    expect(withReviews?.reviews.map((entry) => entry.id)).toEqual([second.id, first.id])
    expect(grants.find((entry) => entry.id === other.id)?.reviews).toEqual([])
  })
})

describe('reviewsByClaim', () => {
  it('groups by claim', () => {
    const map = reviewsByClaim([review({ claimId: 'a' }), review({ claimId: 'b' }), review({ claimId: 'a' })])
    expect(map.get('a')).toHaveLength(2)
    expect(map.get('b')).toHaveLength(1)
  })
})

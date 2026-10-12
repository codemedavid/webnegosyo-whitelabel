import { buildGovDiscountReport, CLIENT_GRANT_LIMIT, NO_BRANCH_KEY } from '@/lib/gov-discount-reports/report'
import { mapRows, toLedgerClaim, toLedgerReview, toReversalStamp } from '@/lib/gov-discount-reports/rows'
import { formatPesoCentavos, orderReference, formatSalesCount, formatManilaDateTime } from '@/lib/gov-discount-reports/format'
import { claim, reversalOf, review } from '../../fixtures/gov-discount-claims'

const DB_ROW = {
  id: 'c-1',
  outlet_id: null,
  backend: 'platform_supabase',
  external_order_id: 'o-1',
  order_label: '#5',
  revision: 0,
  event: 'granted',
  claimant_ref: 'r1',
  kind: 'pwd',
  claimant_name: 'Pedro',
  id_number: '13-7404-000-0001234',
  allocation_mode: 'shared',
  diners: 3,
  vat_status: 'vat',
  gross_share: '112.00',
  vat_exempt_sales: '100.00',
  vat_removed: 12,
  discount: '20',
  net_due: '80',
  reduction: '32',
  order_total: null,
  server_reduction: '30.5',
  verification: 'mismatch',
  flags: ['edited', 'amount_mismatch', 'not_a_flag'],
  granted_by_name: '',
  approved_by_name: '  ',
  source: 'online',
  occurred_at: '2026-10-05T04:00:00.000Z',
}

describe('toLedgerClaim', () => {
  it('reads NUMERIC strings as numbers and keeps only known flags, most severe first', () => {
    const parsed = toLedgerClaim(DB_ROW)
    expect(parsed).toMatchObject({
      kind: 'pwd',
      grossShare: 112,
      discount: 20,
      serverReduction: 30.5,
      orderTotal: null,
      allocationMode: 'shared',
      diners: 3,
      verification: 'mismatch',
      flags: ['amount_mismatch', 'edited'],
      grantedByName: 'Staff',
      approvedByName: null,
      source: 'online',
    })
  })

  it('drops rows the ledger constraints would never allow', () => {
    expect(toLedgerClaim({ ...DB_ROW, kind: 'solo_parent' })).toBeNull()
    expect(toLedgerClaim({ ...DB_ROW, event: 'voided' })).toBeNull()
    expect(mapRows([DB_ROW, { ...DB_ROW, kind: 'x' }], toLedgerClaim)).toHaveLength(1)
  })

  it('reads junk amounts as zero and an unknown verification as payload_only', () => {
    expect(toLedgerClaim({ ...DB_ROW, gross_share: 'abc', verification: 'maybe' })).toMatchObject({
      grossShare: 0,
      verification: 'payload_only',
    })
  })
})

describe('toLedgerReview and toReversalStamp', () => {
  it('maps a review and refuses an unknown verdict', () => {
    const row = { id: 'r', claim_id: 'c', verdict: 'problem', note: 'Check', reviewer_name: 'Ana', created_at: 'x' }
    expect(toLedgerReview(row)).toEqual({ id: 'r', claimId: 'c', verdict: 'problem', note: 'Check', reviewerName: 'Ana', createdAt: 'x' })
    expect(toLedgerReview({ ...row, verdict: 'meh' })).toBeNull()
  })

  it('maps a reversal stamp', () => {
    expect(toReversalStamp(DB_ROW)).toEqual({
      backend: 'platform_supabase',
      externalOrderId: 'o-1',
      revision: 0,
      claimantRef: 'r1',
      occurredAt: '2026-10-05T04:00:00.000Z',
    })
  })
})

describe('buildGovDiscountReport', () => {
  it('nets totals, counts reversed grants and lists the ones that need a look', () => {
    const flagged = claim({ flags: ['approval_missing'] })
    const cancelled = claim({ kind: 'pwd' })
    const rows = [flagged, cancelled, reversalOf(cancelled)]
    const report = buildGovDiscountReport({ rows, laterReversals: [], reviews: [], outlets: [] })

    expect(report.totals.sales).toBe(1)
    expect(report.totals.reduction).toBe(32)
    expect(report.reversedCount).toBe(1)
    expect(report.grantCount).toBe(2)
    expect(report.needsALook.map((grant) => grant.id)).toEqual([flagged.id])
    expect(report.byKind.map((group) => [group.key, group.label, group.totals.sales])).toEqual([
      ['senior', 'Senior Citizen', 1],
      ['pwd', 'PWD', 0],
    ])
    expect(report.byBranch).toBeNull()
    expect(report.kinds).toEqual(['senior', 'pwd'])
  })

  it('breaks down by branch only for a multi-branch store', () => {
    const outlets = [
      { id: 'b1', name: 'Makati' },
      { id: 'b2', name: 'BGC' },
    ]
    const rows = [claim({ outletId: 'b1' }), claim({ outletId: 'b2' }), claim({ outletId: 'b2' }), claim({ outletId: null })]
    const report = buildGovDiscountReport({ rows, laterReversals: [], reviews: [], outlets })
    expect(report.byBranch?.map((group) => [group.label, group.totals.sales])).toEqual([
      ['BGC', 2],
      ['Makati', 1],
      ['No branch recorded', 1],
    ])
    expect(report.byBranch?.some((group) => group.key === NO_BRANCH_KEY)).toBe(true)
  })

  it('caps the list it hands to the browser but not the totals', () => {
    const rows = Array.from({ length: CLIENT_GRANT_LIMIT + 5 }, () => claim())
    const report = buildGovDiscountReport({ rows, laterReversals: [], reviews: [], outlets: [] })
    expect(report.grants).toHaveLength(CLIENT_GRANT_LIMIT)
    expect(report.grantCount).toBe(CLIENT_GRANT_LIMIT + 5)
    expect(report.totals.sales).toBe(CLIENT_GRANT_LIMIT + 5)
  })

  it('takes a reviewed grant off the needs-a-look list', () => {
    const flagged = claim({ flags: ['amount_mismatch'] })
    const report = buildGovDiscountReport({
      rows: [flagged],
      laterReversals: [],
      reviews: [review({ claimId: flagged.id })],
      outlets: [],
    })
    expect(report.needsALook).toEqual([])
    expect(report.grants[0].reviews).toHaveLength(1)
  })
})

describe('format', () => {
  it('writes pesos with centavos and a real minus sign', () => {
    expect(formatPesoCentavos(1234.5)).toBe('₱1,234.50')
    expect(formatPesoCentavos(-32)).toBe('−₱32.00')
    expect(formatPesoCentavos(-0.001)).toBe('₱0.00')
  })

  it('falls back to the tail of the order id when there is no label', () => {
    expect(orderReference({ orderLabel: '#9', externalOrderId: 'x' })).toBe('#9')
    expect(orderReference({ orderLabel: null, externalOrderId: '123456789abcdef' })).toBe('…89abcdef')
    expect(orderReference({ orderLabel: null, externalOrderId: 'short' })).toBe('short')
  })

  it('counts sales and shows Manila time', () => {
    expect(formatSalesCount(1)).toBe('1 sale')
    expect(formatSalesCount(-1)).toBe('-1 sale')
    expect(formatSalesCount(3)).toBe('3 sales')
    expect(formatManilaDateTime('2026-10-04T17:30:00.000Z')).toMatch(/Oct 5/)
    expect(formatManilaDateTime('not a date')).toBe('—')
  })
})

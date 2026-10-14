import {
  REPORT_BREAKDOWNS,
  alignTrend,
  breakdownsFor,
  channelMapping,
  insightBuckets,
  isBreakdownSlug,
  orderTypeMapping,
  outletMapping,
  totalsLedger,
  trendSummary,
  withPrevious,
} from '@/lib/reports/report-view-model'
import type { PeriodRow } from '@/lib/reports/sales-breakdowns'
import type { SalesTotals } from '@/lib/reports/read/report-rpc-rows'

const row = (key: string, netCents: number): PeriodRow => ({
  key,
  orders: 1,
  grossCents: netCents,
  discountCents: 0,
  netCents,
  billedCents: netCents,
  collectedCents: netCents,
})

describe('alignTrend — this period’s buckets beside the comparison’s', () => {
  const currentKeys = ['2026-10-12', '2026-10-13', '2026-10-14']
  const previousKeys = ['2026-10-05', '2026-10-06', '2026-10-07']

  test('zero-fills empty buckets and pairs the comparison by position', () => {
    const buckets = alignTrend({
      grain: 'day',
      currentKeys,
      current: [row('2026-10-12', 1000), row('2026-10-14', 3000)],
      previousKeys,
      previous: [row('2026-10-05', 500)],
    })
    expect(buckets).toEqual([
      { key: '2026-10-12', label: 'Oct 12', currentCents: 1000, previousCents: 500 },
      { key: '2026-10-13', label: 'Oct 13', currentCents: 0, previousCents: 0 },
      { key: '2026-10-14', label: 'Oct 14', currentCents: 3000, previousCents: 0 },
    ])
  })

  test('no comparison = no line (null), never a line of zeros', () => {
    const buckets = alignTrend({ grain: 'day', currentKeys, current: [], previousKeys: null, previous: null })
    expect(buckets.map((bucket) => bucket.previousCents)).toEqual([null, null, null])
  })

  test('a shorter comparison (30-day month before a 31-day one) breaks the line where it runs out', () => {
    const buckets = alignTrend({
      grain: 'day',
      currentKeys,
      current: [],
      previousKeys: previousKeys.slice(0, 2),
      previous: [],
    })
    expect(buckets.map((bucket) => bucket.previousCents)).toEqual([0, 0, null])
  })
})

describe('insightBuckets / trendSummary', () => {
  test('spoken labels for the insight sentence', () => {
    expect(insightBuckets([row('2026-10-10', 9000)], 'day')).toEqual([
      { key: '2026-10-10', label: 'Saturday', netCents: 9000 },
    ])
  })

  test('a chart sentence names the total and the best bucket', () => {
    const summary = trendSummary(
      [
        { key: 'a', label: 'Oct 12', currentCents: 1000, previousCents: null },
        { key: 'b', label: 'Oct 13', currentCents: 250000, previousCents: null },
      ],
      'Net sales',
    )
    expect(summary).toBe('Net sales by bucket: ₱2,510 in total. Highest: Oct 13, ₱2,500.')
  })

  test('an empty period says so', () => {
    expect(trendSummary([{ key: 'a', label: 'Oct 12', currentCents: 0, previousCents: null }], 'Net sales')).toBe(
      'Net sales by bucket: no sales in this period.',
    )
  })
})

describe('withPrevious — each row beside its own figure last period', () => {
  test('joins by key; a row new this period has no previous', () => {
    const joined = withPrevious(
      [
        { key: 'a', netCents: 10 },
        { key: 'b', netCents: 20 },
      ],
      [{ key: 'a', netCents: 7 }],
    )
    expect(joined).toEqual([
      { key: 'a', netCents: 10, previous: { key: 'a', netCents: 7 } },
      { key: 'b', netCents: 20, previous: null },
    ])
  })

  test('comparison off: every previous is undefined (no pill at all)', () => {
    expect(withPrevious([{ key: 'a', netCents: 10 }], null)).toEqual([{ key: 'a', netCents: 10, previous: undefined }])
  })
})

const TOTALS: SalesTotals = {
  orders: 10,
  grossCents: 110000,
  discountCents: 10000,
  deliveryDiscountCents: 500,
  refundCents: 2000,
  netCents: 100000,
  serviceCents: 5000,
  deliveryCents: 4500,
  billedCents: 109500,
  collectedCents: 100000,
  unpaidCents: 10000,
  overpaidCents: 500,
  aovCents: 10000,
  voids: { orders: 1, billedCents: 3000 },
  coverage: { ordersWithoutLines: 0, ordersLinesMismatch: 0, lineGapCents: 0 },
}

describe('totalsLedger — the reconciling totals, top to bottom', () => {
  test('gross − discounts = net; + service + delivery = billed; collected + unpaid − overpaid = billed', () => {
    const lines = totalsLedger(TOTALS)
    expect(lines.map((line) => [line.key, line.sign, line.cents])).toEqual([
      ['gross', null, 110000],
      ['discounts', '−', 10000],
      ['net', '=', 100000],
      ['service', '+', 5000],
      ['delivery', '+', 4500],
      ['billed', '=', 109500],
      ['collected', null, 100000],
      ['unpaid', '+', 10000],
      ['overpaid', '−', 500],
      ['billed', '=', 109500],
    ])
    const by = Object.fromEntries(lines.map((line) => [line.key, line.cents]))
    expect(by.gross - by.discounts).toBe(by.net)
    expect(by.net + by.service + by.delivery).toBe(by.billed)
    expect(by.collected + by.unpaid - by.overpaid).toBe(by.billed)
  })

  test('the totals carry their own emphasis; the rest do not', () => {
    expect(totalsLedger(TOTALS).filter((line) => line.isTotal).map((line) => line.key)).toEqual(['net', 'billed', 'billed'])
  })

  test('an overpaid line only appears when someone overpaid', () => {
    const keys = totalsLedger({ ...TOTALS, overpaidCents: 0, unpaidCents: 9500 }).map((line) => line.key)
    expect(keys).not.toContain('overpaid')
  })
})

describe('dimension mappings', () => {
  test('channels: raw sources merge into the app’s channels', () => {
    expect(['pos', 'web', null, 'qr_handoff', 'mobile'].map((raw) => channelMapping.keyOf(raw))).toEqual([
      'counter',
      'online',
      'online',
      'qr',
      'app',
    ])
    expect(channelMapping.labelOf('counter')).toBe('Counter (POS)')
  })

  test('order types: labelled by the shared normaliser', () => {
    expect(orderTypeMapping.keyOf('dine_in')).toBe(orderTypeMapping.keyOf('Dine In'))
  })

  test('branches: named from the store’s outlets; no branch = Unassigned; a deleted one is said plainly', () => {
    const mapping = outletMapping(new Map([['o1', 'Makati']]))
    expect(mapping.keyOf(null)).toBe('unassigned')
    expect(mapping.labelOf('unassigned')).toBe('Unassigned')
    expect(mapping.labelOf('o1')).toBe('Makati')
    expect(mapping.labelOf('gone')).toBe('Removed branch')
  })
})

describe('breakdown pages', () => {
  test('the six Phase 1 breakdowns, in order', () => {
    expect(REPORT_BREAKDOWNS).toEqual(['items', 'categories', 'payments', 'channels', 'hours', 'branches'])
    expect(isBreakdownSlug('items')).toBe(true)
    expect(isBreakdownSlug('staff')).toBe(false)
    expect(isBreakdownSlug('__proto__')).toBe(false)
  })

  test('Branches only for a store-wide account on a multi-branch store', () => {
    expect(breakdownsFor({ isMultiBranch: true, isBranchLocked: false })).toContain('branches')
    expect(breakdownsFor({ isMultiBranch: false, isBranchLocked: false })).not.toContain('branches')
    expect(breakdownsFor({ isMultiBranch: true, isBranchLocked: true })).not.toContain('branches')
  })
})

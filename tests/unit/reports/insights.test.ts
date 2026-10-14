import { buildSalesInsight, shareWords, type InsightBucket, type SalesInsightInput } from '@/lib/reports/insights'

const week = { phrase: 'this week', isPartial: false, grain: 'day' as const }
const lastWeek = { phrase: 'on last week' }

function bucket(label: string, pesos: number): InsightBucket {
  return { key: label, label, netCents: pesos * 100 }
}

function input(overrides: Partial<SalesInsightInput> = {}): SalesInsightInput {
  return {
    period: week,
    compare: lastWeek,
    current: { netCents: 8_432_000, orders: 312 },
    previous: { netCents: 7_528_571, orders: 280 },
    buckets: [],
    ...overrides,
  }
}

describe('shareWords', () => {
  it.each([
    [0.5, 'half'],
    [0.52, 'half'],
    [0.333, 'a third'],
    [0.25, 'a quarter'],
    [0.28, 'a quarter'],
    [0.667, 'two thirds'],
    [0.75, 'three quarters'],
  ])('%f -> %s', (share, words) => {
    expect(shareWords(share)).toBe(words)
  })

  it.each([0.41, 0.2, 0.6, 0.9, 0, 1])('%f has no words', (share) => {
    expect(shareWords(share)).toBeNull()
  })
})

describe('buildSalesInsight headline', () => {
  it('writes the plan example sentence', () => {
    // 84,320 vs 75,285.71 is +12.0%
    const insight = buildSalesInsight(input({ buckets: [bucket('Saturday', 28_000), bucket('Monday', 14_000), bucket('Sunday', 42_320)] }))
    expect(insight.headline).toBe('₱84,320 this week, up 12% on last week.')
  })

  it('says down for a fall', () => {
    const insight = buildSalesInsight(input({ current: { netCents: 9_000_00, orders: 3 }, previous: { netCents: 10_000_00, orders: 4 } }))
    expect(insight.headline).toBe('₱9,000 this week, down 10% on last week.')
  })

  it('says so far for a partial period and compares with the same time', () => {
    const insight = buildSalesInsight(
      input({
        period: { phrase: 'today', isPartial: true, grain: 'hour' },
        compare: { phrase: 'on the same time last week' },
        current: { netCents: 12_400_00, orders: 40 },
        previous: { netCents: 11_481_00, orders: 38 },
      }),
    )
    expect(insight.headline).toBe('₱12,400 so far today, up 8% on the same time last week.')
  })

  it('calls a tiny change about the same, without the word on', () => {
    const insight = buildSalesInsight(input({ current: { netCents: 10_030_00, orders: 5 }, previous: { netCents: 10_000_00, orders: 5 } }))
    expect(insight.headline).toBe('₱10,030 this week, about the same as last week.')
  })

  it('treats exactly equal sales as about the same', () => {
    const insight = buildSalesInsight(input({ current: { netCents: 500_00, orders: 2 }, previous: { netCents: 500_00, orders: 2 } }))
    expect(insight.headline).toContain('about the same as last week')
  })

  it('never invents a percentage when the comparison had no sales', () => {
    const insight = buildSalesInsight(input({ current: { netCents: 5_200_00, orders: 9 }, previous: { netCents: 0, orders: 0 } }))
    expect(insight.headline).toBe('₱5,200 this week, and last week had no sales to compare with.')
    expect(insight.headline).not.toMatch(/%|Infinity|NaN/)
  })

  it('falls back to the order count when comparison is off', () => {
    const insight = buildSalesInsight(input({ compare: null, previous: null }))
    expect(insight.headline).toBe('₱84,320 this week from 312 orders.')
  })

  it('treats an unknown previous like comparison off', () => {
    const insight = buildSalesInsight(input({ previous: null, current: { netCents: 100_00, orders: 1 } }))
    expect(insight.headline).toBe('₱100 this week from 1 order.')
  })

  it('keeps the so-far wording when comparison is off', () => {
    const insight = buildSalesInsight(
      input({ period: { phrase: 'today', isPartial: true, grain: 'hour' }, compare: null, previous: null, current: { netCents: 300_00, orders: 2 } }),
    )
    expect(insight.headline).toBe('₱300 so far today from 2 orders.')
  })

  it('says there were no sales, with yet for a period still running', () => {
    const running = buildSalesInsight(input({ period: { phrase: 'this week', isPartial: true, grain: 'day' }, current: { netCents: 0, orders: 0 } }))
    expect(running).toEqual({ headline: 'No sales this week yet.', detail: null })
    const finished = buildSalesInsight(input({ period: { phrase: 'last week', isPartial: false, grain: 'day' }, current: { netCents: 0, orders: 0 } }))
    expect(finished).toEqual({ headline: 'No sales last week.', detail: null })
  })

  it('uses no exclamation marks anywhere', () => {
    const insight = buildSalesInsight(input({ buckets: [bucket('Sat', 100), bucket('Sun', 1)] }))
    expect(`${insight.headline} ${insight.detail}`).not.toContain('!')
  })
})

describe('buildSalesInsight detail', () => {
  it('names the standout day with a fraction in words', () => {
    const insight = buildSalesInsight(input({ buckets: [bucket('Saturday', 100), bucket('Monday', 100), bucket('Tuesday', 100)] }))
    expect(insight.detail).toBe('Saturday brought in a third of it.')
  })

  it('breaks ties toward the earliest bucket', () => {
    const insight = buildSalesInsight(input({ buckets: [bucket('Monday', 50), bucket('Tuesday', 50)] }))
    expect(insight.detail).toBe('Monday brought in half of it.')
  })

  it('uses a rounded percent when no fraction fits', () => {
    const insight = buildSalesInsight(input({ buckets: [bucket('Saturday', 41), bucket('Monday', 30), bucket('Tuesday', 29)] }))
    expect(insight.detail).toBe('Saturday brought in 41% of it.')
  })

  it('stays quiet when nothing stands out', () => {
    const buckets = ['A', 'B', 'C', 'D', 'E', 'F'].map((label) => bucket(label, 10))
    expect(buildSalesInsight(input({ buckets })).detail).toBeNull()
  })

  it('stays quiet with fewer than two days of sales, ignoring empty buckets', () => {
    expect(buildSalesInsight(input({ buckets: [bucket('Saturday', 100), bucket('Sunday', 0)] })).detail).toBeNull()
    expect(buildSalesInsight(input({ buckets: [] })).detail).toBeNull()
  })

  it('works for the week grain', () => {
    const insight = buildSalesInsight(
      input({ period: { ...week, grain: 'week' }, buckets: [bucket('The week of Oct 5', 75), bucket('The week of Oct 12', 25)] }),
    )
    expect(insight.detail).toBe('The week of Oct 5 brought in three quarters of it.')
  })

  it('names the busiest hour for an hourly trend', () => {
    const insight = buildSalesInsight(
      input({ period: { phrase: 'yesterday', isPartial: false, grain: 'hour' }, buckets: [bucket('12 PM', 10), bucket('7 PM', 90)] }),
    )
    expect(insight.detail).toBe('Your busiest hour was 7 PM.')
  })

  it('has no detail for a monthly trend', () => {
    const insight = buildSalesInsight(input({ period: { ...week, grain: 'month' }, buckets: [bucket('September', 50), bucket('October', 50)] }))
    expect(insight.detail).toBeNull()
  })
})

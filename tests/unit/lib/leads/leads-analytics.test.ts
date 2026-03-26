import { describe, test, expect, jest, beforeEach } from '@jest/globals'

// Build a reusable chainable mock for Supabase query builders.
// Each method returns `this` so calls can be chained; the terminal
// `.select()` / `.eq()` etc. resolves to `{ data: [], error: null }`.
function makeChain(resolvedValue: { data: unknown; error: null } = { data: [], error: null }) {
  const chain: Record<string, jest.Mock> = {}
  const methods = [
    'from', 'select', 'eq', 'neq', 'gte', 'lte', 'lt', 'gt',
    'in', 'not', 'or', 'order', 'limit', 'single', 'maybeSingle',
    'is', 'filter', 'match', 'range', 'count',
  ]
  methods.forEach(m => {
    chain[m] = jest.fn(() => chain)
  })
  // Make the chain thenable so `await supabase.from(...).select(...)` works
  chain['then'] = jest.fn((resolve: (v: unknown) => unknown) => Promise.resolve(resolvedValue).then(resolve))
  return chain
}

const mockAdminClient = {
  from: jest.fn(),
}

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => mockAdminClient),
}))

// Import after mocking
import { getLeadStats, getLeadsByWeek } from '@/lib/leads/leads-analytics'
import type { LeadStats, WeeklyLeadData } from '@/lib/leads/types'

describe('getLeadStats', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Default: every query resolves to empty data
    mockAdminClient.from.mockImplementation(() => makeChain({ data: [], error: null }))
  })

  test('function exists and is callable', () => {
    expect(typeof getLeadStats).toBe('function')
  })

  test('returns an object with the correct shape', async () => {
    const stats = await getLeadStats()

    expect(stats).toBeDefined()
    expect(typeof stats).toBe('object')
    expect(stats).not.toBeNull()

    const expectedKeys: (keyof LeadStats)[] = [
      'totalLeads',
      'newThisWeek',
      'conversionRate',
      'conversionDelta',
      'pendingCalls',
      'pendingToday',
      'avgResponseTimeHours',
    ]

    expectedKeys.forEach(key => {
      expect(stats).toHaveProperty(key)
      expect(typeof stats[key]).toBe('number')
    })
  })

  test('returns zeros when data is empty (graceful degradation)', async () => {
    const stats = await getLeadStats()

    expect(stats.totalLeads).toBe(0)
    expect(stats.newThisWeek).toBe(0)
    expect(stats.conversionRate).toBe(0)
    expect(stats.conversionDelta).toBe(0)
    expect(stats.pendingCalls).toBe(0)
    expect(stats.pendingToday).toBe(0)
    expect(stats.avgResponseTimeHours).toBe(0)
  })

  test('returns numbers (not NaN or Infinity) when data is empty', async () => {
    const stats = await getLeadStats()

    Object.values(stats).forEach(value => {
      expect(Number.isFinite(value)).toBe(true)
    })
  })

  test('handles Supabase errors gracefully (returns zeros, does not throw)', async () => {
    mockAdminClient.from.mockImplementation(() =>
      makeChain({ data: null as unknown as [], error: { message: 'DB error' } as null })
    )

    await expect(getLeadStats()).resolves.toBeDefined()

    const stats = await getLeadStats()
    Object.values(stats).forEach(value => {
      expect(Number.isFinite(value)).toBe(true)
    })
  })
})

describe('getLeadsByWeek', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAdminClient.from.mockImplementation(() => makeChain({ data: [], error: null }))
  })

  test('function exists and is callable', () => {
    expect(typeof getLeadsByWeek).toBe('function')
  })

  test('returns an array', async () => {
    const result = await getLeadsByWeek()
    expect(Array.isArray(result)).toBe(true)
  })

  test('returns empty array when no data', async () => {
    const result = await getLeadsByWeek()
    expect(result).toHaveLength(0)
  })

  test('accepts optional weeks parameter', async () => {
    await expect(getLeadsByWeek(4)).resolves.toBeDefined()
    await expect(getLeadsByWeek(12)).resolves.toBeDefined()
  })

  test('returns WeeklyLeadData shape when data is present', async () => {
    // Simulate leads returned from Supabase
    const fakeLead = { created_at: new Date().toISOString() }
    mockAdminClient.from.mockImplementation(() =>
      makeChain({ data: [fakeLead, fakeLead, fakeLead], error: null })
    )

    const result = await getLeadsByWeek(1)

    if (result.length > 0) {
      const item: WeeklyLeadData = result[0]
      expect(typeof item.week).toBe('string')
      expect(typeof item.count).toBe('number')
      // week should be a YYYY-MM-DD formatted string
      expect(item.week).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  test('result is sorted ascending by week', async () => {
    const now = new Date()
    const twoWeeksAgo = new Date(now)
    twoWeeksAgo.setDate(now.getDate() - 14)
    const oneWeekAgo = new Date(now)
    oneWeekAgo.setDate(now.getDate() - 7)

    mockAdminClient.from.mockImplementation(() =>
      makeChain({
        data: [
          { created_at: now.toISOString() },
          { created_at: twoWeeksAgo.toISOString() },
          { created_at: oneWeekAgo.toISOString() },
        ],
        error: null,
      })
    )

    const result = await getLeadsByWeek(4)

    for (let i = 1; i < result.length; i++) {
      expect(result[i].week >= result[i - 1].week).toBe(true)
    }
  })
})

/**
 * The staff pages' activity read must page past PostgREST's 1000-row cap.
 *
 * `.limit(2000)` is answered with at most 1000 rows on the platform project,
 * so `rows.length >= limit` never fired: a busy store's staff page silently
 * lost every act older than the newest thousand AND told the owner nothing was
 * missing. The read now walks bounded `range()` pages and the truncation flag
 * is set only when the ceiling was genuinely reached.
 */
jest.mock('server-only', () => ({}))

interface Recorded {
  ranges: [number, number][]
  orders: { column: string; ascending: boolean }[]
  limits: number[]
}

function eventRow(index: number) {
  return {
    id: `e${index}`,
    tenant_id: 't1',
    outlet_id: null,
    backend: 'platform',
    external_order_id: `o${index}`,
    event: 'status_changed',
    status: 'confirmed',
    previous_status: 'pending',
    source: 'pos',
    order_total: 100,
    actor_user_id: 'u1',
    actor_name: 'Ana',
    occurred_at: new Date(Date.UTC(2026, 9, 12) - index * 1000).toISOString(),
  }
}

function installFakeAdmin(total: number, failOnPage?: number): Recorded {
  const recorded: Recorded = { ranges: [], orders: [], limits: [] }
  const rows = Array.from({ length: total }, (_, index) => eventRow(index))
  const builder = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    lte: () => builder,
    order: (column: string, options: { ascending: boolean }) => {
      recorded.orders.push({ column, ascending: options.ascending })
      return builder
    },
    limit: (n: number) => {
      recorded.limits.push(n)
      return builder
    },
    range: (from: number, to: number) => {
      recorded.ranges.push([from, to])
      if (recorded.ranges.length === failOnPage) {
        return Promise.resolve({ data: null, error: { message: 'boom' } })
      }
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
    },
  }
  jest.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }))
  return recorded
}

async function loadService() {
  return import('@/lib/staff-activity/staff-activity-service')
}

beforeEach(() => {
  jest.resetModules()
})

describe('loadOrderStatusEvents paging', () => {
  test('reads past the 1000-row API cap and reports nothing missing below the ceiling', async () => {
    // Arrange
    const recorded = installFakeAdmin(1500)
    const { loadOrderStatusEvents } = await loadService()

    // Act
    const page = await loadOrderStatusEvents('t1', { sinceIso: '2026-10-01T00:00:00Z' })

    // Assert
    expect(page.events).toHaveLength(1500)
    expect(page.isTruncated).toBe(false)
    expect(recorded.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(recorded.limits).toEqual([])
  })

  test('pages on a total ordering so rows cannot shift between pages', async () => {
    const recorded = installFakeAdmin(5)
    const { loadOrderStatusEvents } = await loadService()

    await loadOrderStatusEvents('t1', { sinceIso: '2026-10-01T00:00:00Z' })

    expect(recorded.orders).toEqual([
      { column: 'occurred_at', ascending: false },
      { column: 'id', ascending: false },
    ])
  })

  test('says truncated only when the ceiling is reached, and stays bounded', async () => {
    const recorded = installFakeAdmin(10_000)
    const { loadOrderStatusEvents, ACTIVITY_ROW_CEILING } = await loadService()

    const page = await loadOrderStatusEvents('t1', { sinceIso: '2026-10-01T00:00:00Z' })

    expect(page.events).toHaveLength(ACTIVITY_ROW_CEILING)
    expect(page.isTruncated).toBe(true)
    expect(recorded.ranges.length).toBeLessThanOrEqual(5)
  })

  test('honours a smaller caller limit in a single request', async () => {
    const recorded = installFakeAdmin(500)
    const { loadOrderStatusEvents } = await loadService()

    const page = await loadOrderStatusEvents('t1', { sinceIso: '2026-10-01T00:00:00Z', limit: 50 })

    expect(page.events).toHaveLength(50)
    expect(page.isTruncated).toBe(true)
    expect(recorded.ranges).toEqual([[0, 49]])
  })

  test('throws on a failed page instead of returning a quietly short history', async () => {
    installFakeAdmin(2500, 2)
    const { loadOrderStatusEvents } = await loadService()

    await expect(loadOrderStatusEvents('t1', { sinceIso: '2026-10-01T00:00:00Z' })).rejects.toThrow('boom')
  })
})

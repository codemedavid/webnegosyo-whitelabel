import { fetchConvexActivity } from '@/lib/activity/convex-activity'
import type { ConvexQueryClient } from '@/lib/queries/convex-platform-aggregator'

jest.mock('@/lib/convex/server', () => ({
  createConvexServerClient: jest.fn(),
}))

const WINDOW = { startMs: 1_000, endMs: 5_000 }

function clientReturning(
  period: unknown,
  latest: unknown,
  calls: { path: string; args: Record<string, unknown> }[] = []
): ConvexQueryClient {
  return {
    query: async <T>(path: string, args: Record<string, unknown>): Promise<T> => {
      calls.push({ path, args })
      return (path.includes('Period') ? period : latest) as T
    },
  }
}

describe('fetchConvexActivity', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}))
  afterEach(() => jest.restoreAllMocks())

  it('asks for the window with an inclusive end one millisecond short of the exclusive one', async () => {
    const calls: { path: string; args: Record<string, unknown> }[] = []
    await fetchConvexActivity([{ tenantId: 't1', url: 'u', key: 'k' }], WINDOW, {
      factory: () => clientReturning({ totalOrders: 0, totalRevenue: 0 }, [], calls),
    })

    expect(calls).toContainEqual({
      path: 'orders:getDashboardStatsByPeriodInternal',
      args: { startDate: 1_000, endDate: 4_999 },
    })
  })

  it('reads the period and the newest order', async () => {
    const entries = await fetchConvexActivity([{ tenantId: 't1', url: 'u', key: 'k' }], WINDOW, {
      factory: () =>
        clientReturning(
          {
            totalOrders: 3,
            totalRevenue: 450,
            statusCounts: { delivered: 3 },
          },
          [{ _creationTime: Date.parse('2026-09-28T00:00:00.000Z') }]
        ),
    })

    expect(entries.get('t1')).toEqual({
      source: 'ok',
      stats: {
        orders: 3,
        cancelled: 0,
        revenue: 450,
        lastOrderAt: '2026-09-28T00:00:00.000Z',
        isTruncated: false,
      },
    })
  })

  it('reports a failing deployment as unreachable, with the reason', async () => {
    const entries = await fetchConvexActivity([{ tenantId: 't1', url: 'u', key: 'k' }], WINDOW, {
      factory: () => ({
        query: async () => {
          throw new Error('deployment disabled')
        },
      }),
    })

    expect(entries.get('t1')).toEqual({
      source: 'unreachable',
      stats: null,
      error: 'deployment disabled',
    })
  })

  it('gives up on a deployment that never answers', async () => {
    const entries = await fetchConvexActivity([{ tenantId: 't1', url: 'u', key: 'k' }], WINDOW, {
      timeoutMs: 10,
      factory: () => ({ query: () => new Promise(() => {}) }),
    })

    expect(entries.get('t1')?.source).toBe('unreachable')
  })

  it('keeps one bad store from blanking the others', async () => {
    const entries = await fetchConvexActivity(
      [
        { tenantId: 'bad', url: 'bad', key: 'k' },
        { tenantId: 'good', url: 'good', key: 'k' },
      ],
      WINDOW,
      {
        factory: (url) =>
          url === 'bad'
            ? { query: async () => Promise.reject(new Error('boom')) }
            : clientReturning({ totalOrders: 1, totalRevenue: 10 }, []),
      }
    )

    expect(entries.get('bad')?.source).toBe('unreachable')
    expect(entries.get('good')?.stats?.orders).toBe(1)
  })
})

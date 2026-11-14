/** @jest-environment node */
/**
 * A window in the past (Owl's "yesterday", "Nov 1 – 10"): the platform reader
 * stops at `readEnd` instead of carrying every order since, and the Overview
 * built over it counts only that window against its comparison.
 */
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'
import { buildOverview } from '@/lib/dashboard/overview'
import { DAY_MS, HOUR_MS, windowFromBounds } from '@/lib/dashboard/periods'

jest.mock('server-only', () => ({}))

const YESTERDAY = Date.parse('2026-11-12T00:00:00+08:00')
const TODAY = YESTERDAY + DAY_MS
const LAST_WEEK = YESTERDAY - 7 * DAY_MS
const TENANT = '00000000-0000-4000-8000-000000000001'

function order(id: string, at: number, total: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    tenant_id: TENANT,
    customer_contact: null,
    status: 'delivered',
    payment_status: 'paid',
    source: 'web',
    order_type: 'pickup',
    outlet_id: null,
    total,
    created_at: new Date(at).toISOString(),
    ...extra,
  }
}

describe('a past window', () => {
  test('windowFromBounds: one day buckets by hour, longer windows by day', () => {
    const day = windowFromBounds({ start: YESTERDAY, end: TODAY, previousStart: LAST_WEEK, previousEnd: LAST_WEEK + DAY_MS, dayCount: 1 })
    expect(day).toMatchObject({ bucket: 'hour', bucketCount: 24, bucketMs: HOUR_MS, start: YESTERDAY, end: TODAY, previousStart: LAST_WEEK })

    const tenDays = windowFromBounds({ start: YESTERDAY - 9 * DAY_MS, end: TODAY, previousStart: YESTERDAY - 19 * DAY_MS, previousEnd: YESTERDAY - 9 * DAY_MS, dayCount: 10 })
    expect(tenDays).toMatchObject({ bucket: 'day', bucketCount: 10, range: '30d' })
  })

  test('the platform reader stops at readEnd, and the Overview counts only yesterday vs last week', async () => {
    const { readSupabaseSales } = await import('@/lib/dashboard/read-supabase-sales')
    const { client } = fakeSupabaseTables({
      orders: [
        order('last-week', LAST_WEEK + 10 * HOUR_MS, 100),
        order('yesterday-1', YESTERDAY + 9 * HOUR_MS, 250),
        order('yesterday-2', YESTERDAY + 15 * HOUR_MS, 150),
        order('yesterday-cancelled', YESTERDAY + 16 * HOUR_MS, 999, { status: 'cancelled' }),
        order('today', TODAY + 2 * HOUR_MS, 5000),
      ],
      order_items: [],
    })

    const window = windowFromBounds({ start: YESTERDAY, end: TODAY, previousStart: LAST_WEEK, previousEnd: LAST_WEEK + DAY_MS, dayCount: 1 })
    const read = await readSupabaseSales(client, TENANT, {
      readStart: LAST_WEEK,
      currentStart: YESTERDAY,
      now: TODAY + 6 * HOUR_MS,
      readEnd: TODAY,
      outletId: null,
      includeItems: false,
      includePriorVisits: false,
    })

    expect(read.failed).toBe(false)
    expect(read.sales.map((sale) => sale.id).sort()).toEqual(['last-week', 'yesterday-1', 'yesterday-2', 'yesterday-cancelled'])

    const overview = buildOverview(read.sales, window)
    expect(overview.kpis.sales).toMatchObject({ current: 400, previous: 100, change: 300 })
    expect(overview.kpis.orders).toMatchObject({ current: 2, previous: 1 })
    expect(overview.hours.find((row) => row.hour === 15)).toMatchObject({ orders: 1, sales: 150 })
  })

  test('without readEnd the reader still reads up to now (every dashboard range)', async () => {
    const { readSupabaseSales } = await import('@/lib/dashboard/read-supabase-sales')
    const { client } = fakeSupabaseTables({ orders: [order('yesterday-1', YESTERDAY + HOUR_MS, 10), order('today', TODAY + HOUR_MS, 20)], order_items: [] })

    const read = await readSupabaseSales(client, TENANT, {
      readStart: YESTERDAY,
      currentStart: YESTERDAY,
      now: TODAY + 6 * HOUR_MS,
      outletId: null,
      includeItems: false,
      includePriorVisits: false,
    })

    expect(read.sales.map((sale) => sale.id).sort()).toEqual(['today', 'yesterday-1'])
  })
})

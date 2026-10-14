/**
 * Plan §10.1 invariant 11: a paged read = a one-shot read, on a fixture past
 * PostgREST's 1000-row cap (layer L2: the real reader over the capped fake).
 *
 * The day's orders come from the shared report-order generator, mixed with
 * another store's orders and orders either side of the Manila day, so the
 * reader's tenant and window filters are exercised along with its paging. The
 * expected figure is computed independently, by the sales model over the
 * generated orders, never by the reader under test.
 */
import fc from 'fast-check'
import { getDailyRevenue } from '@/lib/inventory/daily-revenue-read'
import { resolveBusinessDayWindow } from '@/lib/inventory/business-day'
import { fromCents } from '@/lib/reports/money'
import { orderFigures, type ReportOrder } from '@/lib/reports/sales-model'
import { REPORT_ORDER_COLUMNS } from '@/lib/reports/read/platform-order-row'
import { fakeSupabaseTables, PLATFORM_MAX_ROWS } from '../fixtures/fake-supabase-tables'
import { reportOrdersArb, toPlatformTables, type OrderWindow } from '../fixtures/report-orders'
import { REVERSED_STATUSES } from '@/lib/customer-order-facts'

const DAY = '2026-10-01'
const { startIso, endIso } = resolveBusinessDayWindow(DAY)
const DAY_WINDOW = { start: Date.parse(startIso), end: Date.parse(endIso) }
const HOURS = 60 * 60 * 1000
const DAY_BEFORE = { start: DAY_WINDOW.start - 6 * HOURS, end: DAY_WINDOW.start }
const DAY_AFTER = { start: DAY_WINDOW.end, end: DAY_WINDOW.end + 6 * HOURS }

function generate(count: number, seed: number, window: OrderWindow, idPrefix: string): ReportOrder[] {
  const [orders] = fc.sample(reportOrdersArb({ minLength: count, maxLength: count, window }), { numRuns: 1, seed })
  return orders.map((order) => ({ ...order, id: `${idPrefix}${order.id}` }))
}

/**
 * Orders inside the day such that exactly `served` of them come back from the
 * database (the reader filters reversed orders out in the query), plus the
 * reversed ones generated alongside — so a page boundary falls exactly where
 * the test says.
 */
function dayOrders(served: number, seed: number): ReportOrder[] {
  const pool = generate(Math.ceil(served * 1.5) + 50, seed, DAY_WINDOW, 'd')
  const picked: ReportOrder[] = []
  let kept = 0
  for (const order of pool) {
    const isServed = !REVERSED_STATUSES.has(order.status)
    if (isServed && kept === served) continue
    picked.push(order)
    if (isServed) kept += 1
  }
  expect(kept).toBe(served)
  return picked
}

/** What the day took, worked out from the orders themselves. */
function expectedNetSales(orders: readonly ReportOrder[]): number {
  const cents = orders
    .filter((order) => order.at >= DAY_WINDOW.start && order.at < DAY_WINDOW.end)
    .map(orderFigures)
    .filter((figures) => figures.isLive)
    .reduce((sum, figures) => sum + figures.netCents, 0)
  return fromCents(cents)
}

function seedDatabase(served: number, seed: number) {
  const ours = [
    ...dayOrders(served, seed),
    ...generate(150, seed + 1, DAY_BEFORE, 'b'),
    ...generate(150, seed + 2, DAY_AFTER, 'n'),
  ]
  const theirs = generate(300, seed + 3, DAY_WINDOW, 'z')
  const orders = [
    ...toPlatformTables(ours, { tenantId: 't1', moneyAsText: true }).orders,
    ...toPlatformTables(theirs, { tenantId: 't2' }).orders,
  ]
  return { ours, orders }
}

describe('getDailyRevenue — paged past the 1000-row cap', () => {
  test.each([999, 1000, 1001, 2000, 2001])('%i rows served: the capped, paged read equals the whole day', async (served) => {
    const { ours, orders } = seedDatabase(served, served)
    const capped = fakeSupabaseTables({ orders })
    const uncapped = fakeSupabaseTables({ orders }, {}, { maxRows: Number.POSITIVE_INFINITY })

    const paged = await getDailyRevenue({ id: 't1' }, DAY, { platformClient: async () => capped.client })
    const oneShot = await getDailyRevenue({ id: 't1' }, DAY, { platformClient: async () => uncapped.client })

    expect(paged).not.toBeNull()
    expect(paged).toBe(oneShot)
    expect(paged).toBe(expectedNetSales(ours))
    // Every served row came back exactly once, never more than the cap at a time.
    expect(capped.requests.every((request) => request.returned <= PLATFORM_MAX_ROWS)).toBe(true)
    expect(capped.requests.reduce((sum, request) => sum + request.returned, 0)).toBe(served)
  })

  test('a reader that forgets to page comes up short on the same fixture (the cap bites)', async () => {
    const { orders } = seedDatabase(1001, 5)
    const { client } = fakeSupabaseTables({ orders })

    const { data } = await client
      .from('orders')
      .select(REPORT_ORDER_COLUMNS)
      .eq('tenant_id', 't1')
      .not('status', 'in', `(${[...REVERSED_STATUSES].join(',')})`)
      .gte('created_at', startIso)
      .lt('created_at', endIso)

    expect(data).toHaveLength(PLATFORM_MAX_ROWS)
  })
})

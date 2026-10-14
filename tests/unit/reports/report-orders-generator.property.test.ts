/**
 * Phase 0e — the test infrastructure itself: property run settings and the
 * report-order generator. A generator that never produces a refund, a
 * reversed order or a drifted bill would let every invariant pass vacuously,
 * so its spread is pinned here too.
 */
import fc from 'fast-check'
import { toReportOrder } from '@/lib/reports/read/platform-order-row'
import { orderFigures, orderLineFigures, type ReportOrder } from '@/lib/reports/sales-model'
import { toCents } from '@/lib/reports/money'
import { DEFAULT_WINDOW, reportOrdersArb, toPlatformRows, toPlatformTables } from '../../fixtures/report-orders'
import { DEFAULT_PROPERTY_RUNS, propertyParameters, propertyRuns } from '../../utils/property'

describe('property run settings', () => {
  it('runs 200 by default, as CI does on every change', () => {
    expect(DEFAULT_PROPERTY_RUNS).toBe(200)
    expect(propertyRuns({})).toBe(200)
  })

  it('takes the nightly count from FC_NUM_RUNS', () => {
    expect(propertyRuns({ FC_NUM_RUNS: '5000' })).toBe(5000)
  })

  it('refuses a malformed run count instead of running zero', () => {
    expect(() => propertyRuns({ FC_NUM_RUNS: 'lots' })).toThrow(/FC_NUM_RUNS/)
    expect(() => propertyRuns({ FC_NUM_RUNS: '0' })).toThrow(/FC_NUM_RUNS/)
  })

  it('replays a reported failure from FC_SEED and FC_PATH', () => {
    expect(propertyParameters({}, { FC_SEED: '-1234', FC_PATH: '3:1:0' })).toEqual({ numRuns: 200, seed: -1234, path: '3:1:0' })
    expect(() => propertyParameters({}, { FC_SEED: 'abc' })).toThrow(/FC_SEED/)
  })

  it('lets a suite override the count for an expensive property', () => {
    expect(propertyParameters({ numRuns: 20 }, { FC_NUM_RUNS: '5000' }).numRuns).toBe(20)
  })
})

describe('reportOrdersArb', () => {
  const sample = fc.sample(reportOrdersArb({ minLength: 25, maxLength: 25 }), { numRuns: 40, seed: 7 }).flat()

  it('gives every order and line its own id, placed inside the window', () => {
    const lists = fc.sample(reportOrdersArb(), { numRuns: 50, seed: 1 })
    for (const orders of lists) {
      expect(new Set(orders.map((o) => o.id)).size).toBe(orders.length)
      const lineIds = orders.flatMap((o) => o.lines.map((l) => l.id))
      expect(new Set(lineIds).size).toBe(lineIds.length)
      for (const o of orders) {
        expect(o.at).toBeGreaterThanOrEqual(DEFAULT_WINDOW.start)
        expect(o.at).toBeLessThan(DEFAULT_WINDOW.end)
      }
    }
  })

  it('draws money in whole centavos', () => {
    const amounts = sample.flatMap((o) => [
      o.total,
      o.serviceCharge,
      o.deliveryFee,
      ...o.lines.map((l) => l.subtotal),
      ...o.payments.map((p) => p.amount),
    ])
    for (const amount of amounts) {
      if (amount === null) continue
      expect(Math.abs(Number(amount) * 100 - toCents(amount))).toBeLessThan(1e-6)
    }
  })

  it('produces the untidy cases the invariants exist for', () => {
    const count = (predicate: (o: ReportOrder) => boolean) => sample.filter(predicate).length
    const lineGap = (o: ReportOrder) => orderFigures(o).lineGapCents

    expect(count((o) => !orderFigures(o).isLive)).toBeGreaterThan(0)
    expect(count((o) => o.discount !== null)).toBeGreaterThan(0)
    expect(count((o) => (o.discount?.deliveryDiscount ?? 0) > 0)).toBeGreaterThan(0)
    expect(count((o) => o.payments.some((p) => p.kind === 'refund'))).toBeGreaterThan(0)
    expect(count((o) => o.payments.length === 0)).toBeGreaterThan(0)
    expect(count((o) => orderFigures(o).overpaidCents > 0)).toBeGreaterThan(0)
    expect(count((o) => orderFigures(o).unpaidCents > 0)).toBeGreaterThan(0)
    expect(count((o) => o.lines.length === 0)).toBeGreaterThan(0)
    expect(count((o) => { const gap = lineGap(o); return gap !== null && gap !== 0 })).toBeGreaterThan(0)
    expect(count((o) => o.outletId === null)).toBeGreaterThan(0)
    expect(count((o) => o.lines.some((l) => l.categoryName === null))).toBeGreaterThan(0)
    expect(count((o) => o.hasTable)).toBeGreaterThan(0)
    expect(new Set(sample.map((o) => o.channel)).size).toBe(4)
  })
})

describe('toPlatformRows — the generator speaks the platform schema', () => {
  it('reads back through toReportOrder to the same figures, whichever way money and discount are stored', () => {
    fc.assert(
      fc.property(reportOrdersArb({ maxLength: 8 }), fc.boolean(), fc.boolean(), (orders, moneyAsText, discountInBlob) => {
        for (const order of orders) {
          const seed = toPlatformRows(order, { tenantId: 't1', moneyAsText, discountInBlob })
          const read = toReportOrder(seed.orders[0], seed.items, seed.payments)

          expect(orderFigures(read)).toEqual(orderFigures(order))
          expect(orderLineFigures(read)).toEqual(orderLineFigures(order))
          expect([read.at, read.channel, read.orderType, read.outletId, read.hasTable, read.status]).toEqual([
            order.at, order.channel, order.orderType, order.outletId, order.hasTable, order.status,
          ])
        }
      }),
      propertyParameters(),
    )
  })

  it('lays out every order table by table under one tenant', () => {
    const [orders] = fc.sample(reportOrdersArb({ minLength: 10, maxLength: 10 }), { numRuns: 1, seed: 3 })

    const tables = toPlatformTables(orders, { tenantId: 't9' })

    expect(tables.orders).toHaveLength(10)
    expect(tables.items).toHaveLength(orders.reduce((sum, o) => sum + o.lines.length, 0))
    expect(tables.payments).toHaveLength(orders.reduce((sum, o) => sum + o.payments.length, 0))
    expect(new Set([...tables.orders, ...tables.items, ...tables.payments].map((row) => row.tenant_id))).toEqual(new Set(['t9']))
    // Both places a discount can live are exercised.
    const discounted = tables.orders.filter((row) => orders.find((o) => o.id === row.id)?.discount)
    expect(discounted.some((row) => row.discount_data !== null)).toBe(true)
    expect(discounted.some((row) => row.discount_data === null)).toBe(true)
  })
})

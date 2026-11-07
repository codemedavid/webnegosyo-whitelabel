/**
 * @jest-environment node
 */
import { describe, test, expect } from '@jest/globals'
import { pickOrdersToSweep, SWEEP_MAX_FAILED_ATTEMPTS } from '@/lib/inventory/order-stock-sweep'

const NOW = Date.parse('2026-11-07T12:00:00.000Z')
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString()
const hoursAgo = (h: number) => minutesAgo(h * 60)

const order = (id: string, createdAt: string, extra: Record<string, unknown> = {}) =>
  ({ id, created_at: createdAt, status: 'pending', source: 'web', ...extra })

const base = {
  now: NOW,
  claimedOrderIds: new Set<string>(),
  auditsByOrder: new Map<string, string[]>(),
  firstSaleAuditAt: minutesAgo(60 * 48),
}

describe('pickOrdersToSweep', () => {
  test('takes an old-enough web order that nothing has touched', () => {
    expect(pickOrdersToSweep({ ...base, orders: [order('a', minutesAgo(30))] }).map((o) => o.id)).toEqual(['a'])
  })

  test('leaves a fresh order alone: checkout is still depleting it', () => {
    expect(pickOrdersToSweep({ ...base, orders: [order('a', minutesAgo(2))] })).toEqual([])
  })

  test('leaves an order older than 24 hours alone', () => {
    expect(pickOrdersToSweep({ ...base, orders: [order('a', hoursAgo(25))] })).toEqual([])
  })

  test('never takes cancelled orders', () => {
    expect(pickOrdersToSweep({ ...base, orders: [order('a', minutesAgo(30), { status: 'cancelled' })] })).toEqual([])
  })

  test('never takes POS orders: the register has its own durable queue and sends the real lines', () => {
    expect(pickOrdersToSweep({ ...base, orders: [order('a', minutesAgo(30), { source: 'pos' })] })).toEqual([])
  })

  test('skips an order that already holds any stock claim', () => {
    expect(pickOrdersToSweep({ ...base, orders: [order('a', minutesAgo(30))], claimedOrderIds: new Set(['a']) })).toEqual([])
  })

  test('skips an order whose sale was already audited as applied or as nothing to deduct, so it is not re-read forever', () => {
    const auditsByOrder = new Map([['a', ['nothing_to_deduct']], ['b', ['applied']], ['c', ['failed', 'duplicate']]])
    const orders = ['a', 'b', 'c', 'd'].map((id) => order(id, minutesAgo(30)))
    expect(pickOrdersToSweep({ ...base, orders, auditsByOrder }).map((o) => o.id)).toEqual(['d'])
  })

  test('retries an order whose only attempts failed, until the attempt cap', () => {
    const failures = (n: number) => new Map([['a', Array.from({ length: n }, () => 'failed')]])
    const orders = [order('a', minutesAgo(30))]
    expect(pickOrdersToSweep({ ...base, orders, auditsByOrder: failures(SWEEP_MAX_FAILED_ATTEMPTS - 1) })).toHaveLength(1)
    expect(pickOrdersToSweep({ ...base, orders, auditsByOrder: failures(SWEEP_MAX_FAILED_ATTEMPTS) })).toEqual([])
  })

  test('does not touch orders from before the store ever depleted by sale', () => {
    const orders = [order('old', minutesAgo(600)), order('new', minutesAgo(30))]
    const picked = pickOrdersToSweep({ ...base, orders, firstSaleAuditAt: minutesAgo(120) })
    expect(picked.map((o) => o.id)).toEqual(['new'])
  })

  test('takes nothing for a store that has never recorded a sale deduction', () => {
    expect(pickOrdersToSweep({ ...base, orders: [order('a', minutesAgo(30))], firstSaleAuditAt: null })).toEqual([])
  })
})

describe('the sweep route', () => {
  test('refuses a caller without the cron secret', async () => {
    process.env.CRON_SECRET = 'secret'
    const { GET } = await import('@/app/api/inventory/sweep-order-stock/route')
    const { NextRequest } = await import('next/server')
    const res = await GET(new NextRequest('http://localhost/api/inventory/sweep-order-stock', { headers: { authorization: 'Bearer nope' } }))
    expect(res.status).toBe(401)
  })
})

describe('runOrderStockSweep', () => {
  function fakeDb(tables: Record<string, unknown[]>, inserts: unknown[] = []) {
    return {
      from: (table: string) => {
        const b: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'gte', 'lte', 'neq', 'or', 'order', 'limit', 'in']) b[m] = () => b
        b.insert = (row: unknown) => { inserts.push({ table, row }); return Promise.resolve({ error: null }) }
        b.then = (resolve: (v: unknown) => unknown) => resolve({ data: tables[table] ?? [], error: null })
        return b
      },
    } as never
  }

  test('sweeps a platform store order, skips a Convex store, and records nothing-to-deduct once for an empty order', async () => {
    const { runOrderStockSweep } = await import('@/lib/inventory/order-stock-sweep')
    const recent = new Date(NOW - 30 * 60_000).toISOString()
    const inserts: unknown[] = []
    const db = fakeDb({
      tenants: [
        { id: 't-platform', order_backend: 'auto', convex_deployment_url: null },
        { id: 't-convex', order_backend: 'auto', convex_deployment_url: 'https://x.convex.cloud' },
      ],
      orders: [{ id: 'o1', created_at: recent, status: 'pending', source: 'web', outlet_id: null, customer_data: {} }],
      order_stock_applications: [],
      inventory_audit_log: [{ created_at: new Date(NOW - 3 * 86_400_000).toISOString(), order_id: 'zz', outcome: 'applied' }],
      order_items: [],
    }, inserts)

    const summary = await runOrderStockSweep(db, NOW)

    expect(summary.stores).toBe(1)
    expect(summary.nothingToDeduct).toBe(1)
    expect(inserts).toHaveLength(1)
  })
})

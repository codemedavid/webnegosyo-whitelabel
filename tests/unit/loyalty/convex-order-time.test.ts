/** @jest-environment node */
jest.mock('../../../convex-template/convex/_generated/server', () => ({
  query: (config: unknown) => config, internalQuery: (config: unknown) => config,
  mutation: (config: unknown) => config, internalMutation: (config: unknown) => config,
}))
jest.mock('../../../convex-template/convex/auth', () => ({ requireAccess: jest.fn() }))
import { getOrders, getOrderById, getOrderByClientId, getRealtimeQueue, getOrderPayments } from '../../../convex-template/convex/orders'

const settledAt = Date.parse('2026-09-15T15:59:00Z')
const projectedAt = settledAt + 86400000
const order = { _id: 'order', _creationTime: projectedAt, saleOccurredAt: settledAt, status: 'confirmed', customerData: {} }
const tables: Record<string, Record<string, unknown>[]> = {
  orders: [order], orderItems: [], orderPayments: [
    { _id: 'initial', _creationTime: projectedAt, occurredAt: settledAt, orderId: 'order', kind: 'charge', amount: 50 },
    { _id: 'later-refund', _creationTime: projectedAt + 1, orderId: 'order', kind: 'refund', amount: 10 },
  ],
}
const ctx = { db: { get: async () => order, query: (table: string) => {
  const query = { withIndex: () => query, order: () => query, take: async () => tables[table], first: async () => tables[table][0], collect: async () => tables[table] }
  return query
} } }
const run = (registered: unknown, args: unknown = {}) => (registered as { handler: (context: unknown, args: unknown) => Promise<unknown> }).handler(ctx, args)

it('returns settlement time through the existing order timestamp contract on every order read', async () => {
  const expected = expect.objectContaining({ _creationTime: settledAt, saleOccurredAt: settledAt })
  expect(await run(getOrders)).toEqual([expected])
  expect(await run(getOrderById, { orderId: 'order' })).toEqual(expected)
  expect(await run(getOrderByClientId, { clientOrderId: 'client' })).toEqual(expected)
  expect(await run(getRealtimeQueue)).toMatchObject({ confirmed: [expected] })
  expect(order._creationTime).toBe(projectedAt)
})

it('dates the projected initial tender at settlement while preserving later payment timestamps', async () => {
  expect(await run(getOrderPayments, { orderId: 'order' })).toEqual([
    expect.objectContaining({ _id: 'initial', _creationTime: settledAt }),
    expect.objectContaining({ _id: 'later-refund', _creationTime: projectedAt + 1 }),
  ])
})

it('does not let busy neighboring branches hide older orders from a branch drawer', async () => {
  type Row = Record<string, unknown>
  type Expr = (row: Row) => unknown
  const value = (input: unknown, row: Row) => typeof input === 'function' ? input(row) : input
  const q = {
    field: (path: string) => (row: Row) => path.split('.').reduce<unknown>((item, key) => item && typeof item === 'object' ? (item as Row)[key] : undefined, row),
    eq: (a: unknown, b: unknown) => (row: Row) => value(a, row) === value(b, row),
    or: (...predicates: Expr[]) => (row: Row) => predicates.some(predicate => predicate(row)),
    and: (...predicates: Expr[]) => (row: Row) => predicates.every(predicate => predicate(row)),
  }
  let rows: Row[] = [
    ...Array.from({ length: 2100 }, (_, index) => ({ ...order, _id: `neighbor-${index}`, outletId: 'south' })),
    { ...order, _id: 'older-north', customerData: { outlet_id: 'north' } },
    { ...order, _id: 'conflicting-metadata', outletId: 'south', customerData: { outlet_id: 'north' } },
  ]
  const query = {
    order: () => query,
    filter: (predicate: (builder: typeof q) => Expr) => { rows = rows.filter(predicate(q)); return query },
    take: async (limit: number) => rows.slice(0, limit),
  }
  const result = await (getOrders as unknown as { handler: (context: unknown, args: unknown) => Promise<unknown> }).handler(
    { db: { query: () => query } }, { outletId: 'north', limit: 200 },
  )
  expect(result).toEqual([expect.objectContaining({ _id: 'older-north' })])
})

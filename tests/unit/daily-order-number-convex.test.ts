/** @jest-environment node */
jest.mock('../../convex-template/convex/_generated/server', () => ({
  mutation: (config: unknown) => config, internalMutation: (config: unknown) => config,
  query: (config: unknown) => config, internalQuery: (config: unknown) => config,
}))
import { createOrder } from '../../convex-template/convex/orders'

type Row = Record<string, unknown> & { _id: string }
it('allocates per Manila day and recovers the same number for a retried order', async () => {
  const tables = new Map<string, Row[]>()
  let nextId = 0
  const ctx = {
    db: {
      query: (table: string) => ({ withIndex: (_index: string, build: (q: { eq: (field: string, value: unknown) => void }) => unknown) => {
        let field: string; let value: unknown
        build({ eq: (f, v) => { field = f; value = v } })
        const find = async () => tables.get(table)?.find(row => row[field] === value) ?? null
        return { first: find, unique: find, collect: async () => tables.get(table)?.filter(row => row[field] === value) ?? [] }
      } }),
      insert: async (table: string, value: Record<string, unknown>) => {
        const row = { ...value, _id: String(++nextId) }
        tables.set(table, [...(tables.get(table) ?? []), row])
        return row._id
      },
      patch: async (id: string, patch: Record<string, unknown>) => {
        const row = [...tables.values()].flat().find(row => row._id === id)
        if (!row) throw new Error('Missing counter')
        Object.assign(row, patch)
      },
    },
    scheduler: { runAfter: jest.fn() },
  }
  const handler = (createOrder as unknown as { handler: (ctx: unknown, args: Record<string, unknown>) => Promise<string> }).handler
  const input = { customerName: 'A', customerContact: '', total: 100, source: 'pos', itemCount: 0, items: [], clientOrderId: 'first' }
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-15T15:59:00Z'))
  try {
    const first = await handler(ctx, input)
    expect(await handler(ctx, input)).toBe(first)
    await handler(ctx, { ...input, clientOrderId: 'second' })
    clock.mockReturnValue(Date.parse('2026-09-15T16:00:00Z'))
    await handler(ctx, { ...input, clientOrderId: 'tomorrow' })
    expect(tables.get('orders')?.map(({ dailyNumber, orderDate }) => ({ dailyNumber, orderDate }))).toEqual([
      { dailyNumber: 1, orderDate: '2026-09-15' },
      { dailyNumber: 2, orderDate: '2026-09-15' },
      { dailyNumber: 1, orderDate: '2026-09-16' },
    ])
    expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(3)
    // Rebuilding a missing counter must continue after existing daily numbers.
    tables.set('dailyOrderCounters', [])
    await handler(ctx, { ...input, clientOrderId: 'after-recovery' })
    expect(tables.get('orders')?.at(-1)).toMatchObject({ dailyNumber: 2, orderDate: '2026-09-16' })
  } finally { clock.mockRestore() }
})

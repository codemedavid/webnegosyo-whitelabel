/** @jest-environment node */
/**
 * get_activity_log ("who punched what") and get_order ("order #42"):
 * what reaches the model, what the database is asked, and the refusals.
 */
import { createRefBook } from '@/lib/assistant/refs'
import { createTurnMemo, factsForModel } from '@/lib/assistant/tools/registry'
import { ACTIVITY_KINDS } from '@/lib/activity/taxonomy'
import { KIND_WORDS } from '@/lib/assistant/insights/activity-log'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/assistant/data/cutoff-schedule', () => ({ cutoffScheduleFor: jest.fn(async () => []) }))

// Friday 2026-11-13, 2:30 PM Manila.
const NOW = Date.parse('2026-11-13T06:30:00Z')
const TENANT = '00000000-0000-4000-8000-0000000000aa'
const ANA = '11111111-1111-4111-8111-111111111111'
const MARCO = '22222222-2222-4222-8222-222222222222'
const ORDER_ID = '33333333-3333-4333-8333-333333333333'

function activityRow(overrides: Record<string, unknown>) {
  return {
    id: `44444444-4444-4444-8444-${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}`,
    outlet_id: null,
    outlet_name: null,
    occurred_at: '2026-11-12T06:10:00Z',
    category: 'orders',
    kind: 'order.cancelled',
    is_routine: false,
    actor_user_id: ANA,
    actor_name: 'Ana Cruz',
    approved_by_name: null,
    amount: 180,
    quantity: null,
    unit: null,
    reason: 'Wrong item',
    note: null,
    subject_type: 'order',
    subject_ref: ORDER_ID,
    order_number: '#42',
    before: null,
    after: null,
    summary: { title: '#42 cancelled', customer: 'Juan D. 0917***1234' },
    flags: [],
    reviewed_at: null,
    reviewed_by_name: null,
    ...overrides,
  }
}

const SUMMARY = {
  byKind: [
    { kind: 'order.cancelled', statutory: false, count: 3, amount: 540, quantity: null },
    { kind: 'discount.applied', statutory: false, count: 2, amount: -60, quantity: null },
  ],
  byActor: [
    { actorUserId: ANA, actorName: 'Ana Cruz', kind: 'order.cancelled', count: 3, amount: 540 },
    { actorUserId: MARCO, actorName: 'Marco Reyes', kind: 'discount.applied', count: 2, amount: -60 },
  ],
  byDay: [],
  routine: [{ kind: 'order.placed', count: 80, amount: 24000 }],
  flaggedOpen: 1,
}

function rpcClient(rows: unknown[], { summary = SUMMARY as unknown, error = null as { message: string; code?: string } | null } = {}) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  return {
    calls,
    rpc: jest.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args })
      if (error) return { data: null, error }
      return { data: fn === 'get_store_activity_summary' ? summary : rows, error: null }
    }),
  }
}

async function useClient(client: unknown) {
  const { createClient } = jest.requireMock('@/lib/supabase/server') as { createClient: jest.Mock }
  createClient.mockResolvedValue(client)
}

function ctx(refs = createRefBook({}), caller: Record<string, unknown> = { userId: 'owner', role: 'admin', is_owner: true, permissions: null }) {
  return { tenantId: TENANT, refs, memo: createTurnMemo(), caller, flags: { isPlatformOrders: true } } as never
}

describe('get_activity_log', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }))
  afterEach(() => jest.useRealTimers())

  test('every activity kind has words for the roll-up', () => {
    for (const kind of ACTIVITY_KINDS) expect(KIND_WORDS[kind]).toMatch(/\w/)
  })

  test('yesterday: one sentence per entry with the person as a ref; ids and the masked customer never reach the model', async () => {
    const client = rpcClient([
      activityRow({}),
      activityRow({
        kind: 'cash.pay_out',
        category: 'cash',
        actor_user_id: MARCO,
        actor_name: 'Marco Reyes',
        amount: -80,
        reason: 'Ice (Yelo)',
        order_number: null,
        subject_type: 'shift',
        summary: { title: 'Took ₱80 out of the drawer' },
        flags: ['after_hours'],
      }),
    ])
    await useClient(client)
    const { getActivityLogTool } = await import('@/lib/assistant/tools/reads/activity-log')
    const refs = createRefBook({})

    const result = await getActivityLogTool.run(ctx(refs), getActivityLogTool.input.parse({ period: 'yesterday' }))

    const list = client.calls.find((call) => call.fn === 'get_store_activity')!
    expect(list.args).toMatchObject({
      p_tenant_id: TENANT,
      p_since: '2026-11-11T16:00:00.000Z',
      p_until: '2026-11-12T16:00:00.000Z',
      p_include_routine: false,
      p_actor_user_id: null,
    })
    const facts = factsForModel(result)
    const text = JSON.stringify(facts)
    expect(text).not.toMatch(/1111-4111|2222-4222|3333-4333/)
    expect(text).not.toContain('0917')
    expect(text).not.toContain('Juan')
    expect(facts.period).toBe('Yesterday')
    expect(facts.entries).toEqual([
      expect.objectContaining({ who: 'Ana Cruz', ref: 's1', order: '#42', amount: 180, detail: 'Wrong item' }),
      expect.objectContaining({ who: 'Marco Reyes', ref: 's2', amount: -80, check: [expect.stringContaining('after the shift')] }),
    ])
    expect(facts.storeWide).toMatchObject({
      totals: [{ what: 'Orders cancelled', count: 3, amount: 540 }, { what: 'Discounts given', count: 2, amount: -60 }],
      byPerson: [expect.objectContaining({ who: 'Ana Cruz', actions: 3 }), expect.objectContaining({ who: 'Marco Reyes', actions: 2 })],
      needsALook: 1,
    })
    expect(result.card).toMatchObject({ type: 'ranked', title: 'Store activity', subtitle: 'Yesterday' })
  })

  test('a staff NAME is matched in the period roll-up and sent as that person only', async () => {
    const client = rpcClient([activityRow({ kind: 'discount.applied', category: 'money', actor_user_id: MARCO, actor_name: 'Marco Reyes' })])
    await useClient(client)
    const { getActivityLogTool } = await import('@/lib/assistant/tools/reads/activity-log')

    const result = await getActivityLogTool.run(ctx(), getActivityLogTool.input.parse({ staff: 'marco', category: 'money' }))

    expect(client.calls.find((call) => call.fn === 'get_store_activity')!.args).toMatchObject({ p_actor_user_id: MARCO, p_categories: ['money'] })
    // Filtered answers do not carry the store-wide roll-up (it would read as this person's).
    expect(result.facts.storeWide).toBeUndefined()
    expect(result.facts.filters).toMatchObject({ staff: 's1', category: 'money' })
  })

  test('an unknown or ambiguous name is refused in words', async () => {
    await useClient(rpcClient([]))
    const { getActivityLogTool } = await import('@/lib/assistant/tools/reads/activity-log')
    expect((await getActivityLogTool.run(ctx(), getActivityLogTool.input.parse({ staff: 'Liza' }))).facts).toEqual({
      available: false,
      reason: 'No activity by anyone called "Liza" in this period.',
    })
    expect((await getActivityLogTool.run(ctx(), getActivityLogTool.input.parse({ staff: 'r' }))).facts.available).toBe(false)
  })

  test('an order number keeps only that order, routine lines included', async () => {
    const client = rpcClient([
      activityRow({ kind: 'order.placed', is_routine: true, summary: { title: '#42 placed' } }),
      activityRow({ order_number: '#142' }),
    ])
    await useClient(client)
    const { getActivityLogTool } = await import('@/lib/assistant/tools/reads/activity-log')

    const result = await getActivityLogTool.run(ctx(), getActivityLogTool.input.parse({ order: '42', period: 'yesterday' }))

    expect(client.calls.find((call) => call.fn === 'get_store_activity')!.args).toMatchObject({ p_search: '#42', p_include_routine: true })
    expect((result.facts.entries as unknown[]).length).toBe(1)
  })

  test('the database refusing the caller is said plainly, never shown as "nothing happened"', async () => {
    await useClient(rpcClient([], { error: { message: 'Not allowed', code: '42501' } }))
    const { getActivityLogTool } = await import('@/lib/assistant/tools/reads/activity-log')

    const result = await getActivityLogTool.run(ctx(), getActivityLogTool.input.parse({}))

    expect(result.facts).toEqual({ available: false, reason: 'This account may not see the store activity log.' })
  })

  test('is offered only with activity_view (opt-in: legacy full-access staff do not have it)', async () => {
    const { getActivityLogTool } = await import('@/lib/assistant/tools/reads/activity-log')
    const { canUseTool } = await import('@/lib/assistant/tools/registry')
    const flags = { inventoryEnabled: true, customerHubOn: true, menuEngineeringEnabled: true, isPlatformOrders: true }
    expect(canUseTool(getActivityLogTool as never, { role: 'admin', is_owner: true, permissions: null }, flags)).toBe(true)
    expect(canUseTool(getActivityLogTool as never, { role: 'admin', is_owner: false, permissions: null }, flags)).toBe(false)
    expect(canUseTool(getActivityLogTool as never, { role: 'admin', is_owner: false, permissions: ['orders', 'activity_view'] }, flags)).toBe(true)
  })
})

function ordersClient(orders: Array<Record<string, unknown>>, items: Array<Record<string, unknown>>, activity: unknown[] = []) {
  const filters: Array<[string, string, unknown]> = []
  const builder = (table: string) => {
    const rows = table === 'orders' ? orders : items
    const chain: Record<string, unknown> = {}
    for (const op of ['eq', 'gte', 'lte']) {
      chain[op] = (column: string, value: unknown) => {
        filters.push([table, `${op}:${column}`, value])
        return chain
      }
    }
    chain.order = () => chain
    chain.limit = () => chain
    chain.select = () => chain
    chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null })
    return chain
  }
  return {
    filters,
    from: (table: string) => builder(table),
    rpc: jest.fn(async () => ({ data: activity, error: null })),
  }
}

const ORDER_ROW = {
  id: ORDER_ID,
  daily_number: 42,
  order_date: '2026-11-12',
  created_at: '2026-11-12T05:55:00Z',
  status: 'cancelled',
  payment_status: 'paid',
  payment_method_name: 'GCash',
  order_type: 'Dine-in',
  source: 'pos',
  total: '360.00',
  discount_total: '20',
  delivery_fee: 0,
  service_charge_amount: 0,
  amount_paid: '360',
  cancel_reason: 'Wrong item',
  customer_name: 'Juan Dela Cruz',
  revision_number: 2,
  scheduled_for: null,
}

describe('get_order', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }))
  afterEach(() => jest.useRealTimers())

  test('finds #42 in the last 7 days and tells the model what happened to it, with ids scrubbed', async () => {
    const client = ordersClient(
      [ORDER_ROW, { ...ORDER_ROW, id: 'other', order_date: '2026-11-09' }],
      [{ menu_item_name: 'Sisig', quantity: 2, subtotal: '360', variation: 'Large', addons: ['Egg'] }],
      [activityRow({ occurred_at: '2026-11-12T06:10:00Z' }), activityRow({ kind: 'order.placed', is_routine: true, occurred_at: '2026-11-12T05:55:00Z', summary: { title: '#42 placed' } })],
    )
    await useClient(client)
    const { getOrderTool } = await import('@/lib/assistant/tools/reads/order-lookup')

    const result = await getOrderTool.run(ctx(), getOrderTool.input.parse({ number: '#42' }))

    expect(client.filters).toEqual(
      expect.arrayContaining([
        ['orders', 'eq:tenant_id', TENANT],
        ['orders', 'eq:daily_number', 42],
        ['orders', 'gte:order_date', '2026-11-07'],
        ['orders', 'lte:order_date', '2026-11-13'],
        ['order_items', 'eq:order_id', ORDER_ID],
      ]),
    )
    expect(client.rpc).toHaveBeenCalledWith('get_store_activity', expect.objectContaining({ p_subject_type: 'order', p_subject_ref: ORDER_ID, p_include_routine: true }))
    const facts = factsForModel(result)
    expect(JSON.stringify(facts)).not.toMatch(/3333-4333|1111-4111/)
    expect(facts).toMatchObject({
      order: '#42',
      status: 'cancelled',
      channel: 'Counter (POS)',
      total: 360,
      discount: 20,
      cancelReason: 'Wrong item',
      customer: 'Juan C.',
      edited: '1 time(s)',
      items: [{ name: 'Sisig', qty: 2, subtotal: 360, choice: 'Large', addons: ['Egg'] }],
      sameNumberAlsoOn: ['2026-11-09'],
    })
    // Oldest first, so it reads as the order's story.
    expect((facts.history as Array<{ what: string }>).map((step) => step.what)).toEqual(['Ana rang up #42', 'Ana cancelled #42'])
  })

  test('the customer name is left out for staff without the customers key', async () => {
    await useClient(ordersClient([ORDER_ROW], []))
    const { getOrderTool } = await import('@/lib/assistant/tools/reads/order-lookup')

    const result = await getOrderTool.run(
      ctx(createRefBook({}), { userId: 'cashier', role: 'admin', is_owner: false, permissions: ['orders'] }),
      getOrderTool.input.parse({ number: '42', date: '2026-11-12' }),
    )

    expect(result.facts.customer).toBeUndefined()
  })

  test('not found, a future date and a non-number are answered in words', async () => {
    await useClient(ordersClient([], []))
    const { getOrderTool } = await import('@/lib/assistant/tools/reads/order-lookup')

    expect((await getOrderTool.run(ctx(), getOrderTool.input.parse({ number: '7' }))).facts).toEqual({
      available: false,
      reason: 'No order #7 in the last 7 days that this account can see.',
    })
    expect((await getOrderTool.run(ctx(), getOrderTool.input.parse({ number: '7', date: '2026-11-20' }))).facts.available).toBe(false)
    expect((await getOrderTool.run(ctx(), getOrderTool.input.parse({ number: 'abc' }))).facts.available).toBe(false)
  })

  test('is offered only on platform-order stores', async () => {
    const { getOrderTool } = await import('@/lib/assistant/tools/reads/order-lookup')
    const { canUseTool } = await import('@/lib/assistant/tools/registry')
    const owner = { role: 'admin', is_owner: true, permissions: null }
    const flags = { inventoryEnabled: true, customerHubOn: true, menuEngineeringEnabled: true }
    expect(canUseTool(getOrderTool as never, owner, { ...flags, isPlatformOrders: true })).toBe(true)
    expect(canUseTool(getOrderTool as never, owner, { ...flags, isPlatformOrders: false })).toBe(false)
  })
})

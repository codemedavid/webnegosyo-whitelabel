/** @jest-environment node */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrderSummary } from '@/lib/app-api/orders/order-index'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/app-api/store-reads', () => ({
  AppReadError: class AppReadError extends Error {
    constructor(readonly source: string, detail: string) {
      super(`Customer app could not read ${source}: ${detail}`)
      this.name = 'AppReadError'
    }
  },
}))

// next/jest leaves static imports ahead of jest.mock: load the module lazily.
const load = async () => import('@/lib/app-api/orders/order-index')
const loadCursor = async () => import('@/lib/app-api/orders/order-cursor')

type Row = Record<string, unknown>

const STORE = '00000000-0000-4000-8000-000000000001'
const CUSTOMER = '00000000-0000-4000-8000-0000000000c1'
const OTHER_CUSTOMER = '00000000-0000-4000-8000-0000000000c2'
const KEY = 'attempt-0001'

const SUMMARY: OrderSummary = {
  lines: [{ itemId: 'item-1', name: 'Iced Latte', quantity: 2, options: ['Large'], lineTotal: 240, selections: { size: { large: 1 } } }],
  totals: { subtotal: 240, discount: 0, serviceCharge: 0, deliveryFee: 0, total: 240 },
  orderKind: 'pickup',
  orderTypeName: 'Pickup',
  outletName: null,
  number: '07',
  paymentMethodName: 'GCash',
}

// --- A focused fake of the PostgREST builder calls the repository makes -------

interface Fake {
  client: SupabaseClient
  rows: Row[]
  /** Forces the next update to touch zero rows (an RLS-style silent refusal). */
  refuseNextUpdate: () => void
}

let sequence = 0
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
/** Postgres-style instants with microseconds, strictly increasing. */
const stamp = (n: number) => `2026-11-04T10:00:${String(n % 60).padStart(2, '0')}.${String(100000 + n).slice(-6)}+00:00`

function keysetPredicate(filter: string): (row: Row) => boolean {
  const match = /^created_at\.lt\."([^"]+)",and\(created_at\.eq\."([^"]+)",id\.lt\.([0-9a-f-]+)\)$/.exec(filter)
  if (!match) throw new Error(`fake: unmodelled or(${filter})`)
  const [, createdAt, , id] = match
  return (row) => String(row.created_at) < createdAt || (row.created_at === createdAt && String(row.id) < id)
}

function createFake(seed: Row[] = []): Fake {
  const rows: Row[] = [...seed]
  let refuse = false

  function builder() {
    const predicates: Array<(row: Row) => boolean> = []
    const orderings: Array<{ column: string; ascending: boolean }> = []
    let limitCount: number | null = null
    let single = false
    let action: { kind: 'select' } | { kind: 'update'; patch: Row } | { kind: 'upsert'; row: Row; conflict: string[] } = { kind: 'select' }

    const run = (): { data: unknown; error: unknown } => {
      if (action.kind === 'upsert') {
        const candidate = action.row
        const conflict = action.conflict
        if (rows.some((row) => conflict.every((column) => row[column] === candidate[column]))) return { data: [], error: null }
        sequence += 1
        const inserted = { id: uuid(sequence), state: 'placing', order_id: null, summary: null, last_status: null, last_status_at: null, placed_at: null, created_at: stamp(sequence), ...candidate }
        rows.push(inserted)
        return { data: [{ id: inserted.id }], error: null }
      }
      const matched = rows.filter((row) => predicates.every((predicate) => predicate(row)))
      if (action.kind === 'update') {
        if (refuse) {
          refuse = false
          return { data: [], error: null }
        }
        const patch = action.patch
        matched.forEach((row) => rows.splice(rows.indexOf(row), 1, { ...row, ...patch }))
        return { data: matched.map((row) => ({ id: row.id })), error: null }
      }
      const sorted = [...matched].sort((a, b) => {
        for (const { column, ascending } of orderings) {
          const order = String(a[column]).localeCompare(String(b[column]))
          if (order !== 0) return ascending ? order : -order
        }
        return 0
      })
      const limited = limitCount === null ? sorted : sorted.slice(0, limitCount)
      if (single) return { data: limited[0] ?? null, error: limited.length > 1 ? { message: 'multiple rows' } : null }
      return { data: limited, error: null }
    }

    const api = {
      select: () => api,
      eq: (column: string, value: unknown) => {
        predicates.push((row) => row[column] === value)
        return api
      },
      or: (filter: string) => {
        predicates.push(keysetPredicate(filter))
        return api
      },
      order: (column: string, options: { ascending?: boolean } = {}) => {
        orderings.push({ column, ascending: options.ascending ?? true })
        return api
      },
      limit: (count: number) => {
        limitCount = count
        return api
      },
      maybeSingle: () => {
        single = true
        return api
      },
      update: (patch: Row) => {
        action = { kind: 'update', patch }
        return api
      },
      upsert: (row: Row, options: { onConflict: string; ignoreDuplicates: boolean }) => {
        if (!options.ignoreDuplicates) throw new Error('fake: only ON CONFLICT DO NOTHING is modelled')
        action = { kind: 'upsert', row, conflict: options.onConflict.split(',') }
        return api
      },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        try {
          return Promise.resolve(run()).then(resolve, reject)
        } catch (error) {
          return Promise.reject(error).then(resolve, reject)
        }
      },
    }
    return api
  }

  const client = { from: (table: string) => (table === 'customer_app_orders' ? builder() : (() => { throw new Error(table) })()) }
  return { client: client as unknown as SupabaseClient, rows, refuseNextUpdate: () => { refuse = true } }
}

const silentLog = () => ({ debug: jest.fn(), error: jest.fn() })
const claimInput = (overrides: Partial<{ customerId: string; idempotencyKey: string }> = {}) => ({
  tenantId: STORE,
  appId: STORE,
  customerId: CUSTOMER,
  backend: 'platform' as const,
  idempotencyKey: KEY,
  ...overrides,
})

async function setup(seed: Row[] = []) {
  const { createOrderIndex } = await load()
  const fake = createFake(seed)
  const log = silentLog()
  const index = createOrderIndex(fake.client, { log, now: () => new Date('2026-11-04T12:00:00.000Z') })
  return { index, fake, log }
}

describe('claimOrderKey', () => {
  it('claims a new key', async () => {
    const { index, fake } = await setup()
    const result = await index.claimOrderKey(claimInput())
    expect(result).toEqual({ kind: 'claimed', id: fake.rows[0].id })
    expect(fake.rows[0]).toMatchObject({ tenant_id: STORE, app_id: STORE, customer_id: CUSTOMER, backend: 'platform', state: 'placing' })
  })

  it('answers "placing" for a retry while the first attempt is in flight', async () => {
    const { index } = await setup()
    await index.claimOrderKey(claimInput())
    const retry = await index.claimOrderKey(claimInput())
    expect(retry.kind).toBe('placing')
  })

  it('answers the same order for a retry of a placed key', async () => {
    const { index } = await setup()
    const first = await index.claimOrderKey(claimInput())
    if (first.kind !== 'claimed') throw new Error('expected a claim')
    expect(await index.markPlaced(first.id, { orderId: 'order-1', summary: SUMMARY, status: 'pending' })).toBe(true)
    const retry = await index.claimOrderKey(claimInput())
    expect(retry).toMatchObject({ kind: 'placed', row: { id: first.id, orderId: 'order-1', state: 'placed', lastStatus: 'pending', summary: SUMMARY } })
  })

  it('answers "failed" for a key whose attempt wrote nothing, and reopens it', async () => {
    const { index, fake } = await setup()
    const first = await index.claimOrderKey(claimInput())
    if (first.kind !== 'claimed') throw new Error('expected a claim')
    expect(await index.markFailed(first.id)).toBe(true)
    expect((await index.claimOrderKey(claimInput())).kind).toBe('failed')
    expect(await index.reopenFailed(first.id, 'convex')).toBe(true)
    expect(fake.rows[0]).toMatchObject({ state: 'placing', backend: 'convex' })
    expect(await index.reopenFailed(first.id)).toBe(false)
  })

  it('treats a key held by another customer as a conflict, never their order', async () => {
    const { index } = await setup()
    const first = await index.claimOrderKey(claimInput())
    if (first.kind !== 'claimed') throw new Error('expected a claim')
    await index.markPlaced(first.id, { orderId: 'order-1', summary: SUMMARY, status: 'pending' })
    expect(await index.claimOrderKey(claimInput({ customerId: OTHER_CUSTOMER }))).toEqual({ kind: 'conflict' })
  })

  it('fails (never re-places) when the held row is unreadable', async () => {
    const { index, fake } = await setup()
    await index.claimOrderKey(claimInput())
    fake.rows.splice(0, 1, { ...fake.rows[0], state: 'placed', order_id: 'order-1', placed_at: stamp(1), summary: { lines: 'garbage' } })
    await expect(index.claimOrderKey(claimInput())).rejects.toThrow(/unreadable/)
  })

  it('refuses malformed input before touching the table', async () => {
    const { index, fake } = await setup()
    await expect(index.claimOrderKey(claimInput({ idempotencyKey: 'short' }))).rejects.toThrow(/key/)
    await expect(index.claimOrderKey(claimInput({ idempotencyKey: 'has spaces here' }))).rejects.toThrow(/key/)
    await expect(index.claimOrderKey(claimInput({ customerId: 'not-a-uuid' }))).rejects.toThrow(/uuid/)
    expect(fake.rows).toHaveLength(0)
  })
})

describe('conditional updates', () => {
  it('report not-applied when the row is no longer placing', async () => {
    const { index } = await setup()
    const first = await index.claimOrderKey(claimInput())
    if (first.kind !== 'claimed') throw new Error('expected a claim')
    expect(await index.markPlaced(first.id, { orderId: 'order-1', summary: SUMMARY, status: 'pending' })).toBe(true)
    expect(await index.markPlaced(first.id, { orderId: 'order-2', summary: SUMMARY, status: 'pending' })).toBe(false)
    expect(await index.markFailed(first.id)).toBe(false)
  })

  it('report not-applied on a silent zero-row refusal', async () => {
    const { index, fake } = await setup()
    const first = await index.claimOrderKey(claimInput())
    if (first.kind !== 'claimed') throw new Error('expected a claim')
    fake.refuseNextUpdate()
    expect(await index.markPlaced(first.id, { orderId: 'order-1', summary: SUMMARY, status: 'pending' })).toBe(false)
    expect(fake.rows[0].state).toBe('placing')
  })

  it('refuse a summary that does not hold the stored shape', async () => {
    const { index } = await setup()
    const first = await index.claimOrderKey(claimInput())
    if (first.kind !== 'claimed') throw new Error('expected a claim')
    const bad = { ...SUMMARY, lines: [] } as unknown as OrderSummary
    await expect(index.markPlaced(first.id, { orderId: 'order-1', summary: bad, status: 'pending' })).rejects.toThrow()
  })

  it('records a live status only on placed rows', async () => {
    const { index, fake } = await setup()
    const first = await index.claimOrderKey(claimInput())
    if (first.kind !== 'claimed') throw new Error('expected a claim')
    expect(await index.recordStatus(first.id, 'ready')).toBe(false)
    await index.markPlaced(first.id, { orderId: 'order-1', summary: SUMMARY, status: 'pending' })
    expect(await index.recordStatus(first.id, 'ready')).toBe(true)
    expect(fake.rows[0]).toMatchObject({ last_status: 'ready', last_status_at: '2026-11-04T12:00:00.000Z' })
    expect(await index.recordStatus('not-a-uuid', 'ready')).toBe(false)
  })
})

// --- Reads ----------------------------------------------------------------------

function placedRow(n: number, overrides: Row = {}): Row {
  return {
    id: uuid(1000 + n),
    tenant_id: STORE,
    app_id: STORE,
    customer_id: CUSTOMER,
    backend: 'platform',
    order_id: `order-${n}`,
    idempotency_key: `attempt-${String(n).padStart(4, '0')}`,
    state: 'placed',
    summary: SUMMARY,
    last_status: 'pending',
    last_status_at: stamp(n),
    placed_at: stamp(n),
    created_at: stamp(n),
    ...overrides,
  }
}

describe('getCustomerOrder', () => {
  it('returns the caller’s own placed order only', async () => {
    const { index } = await setup([
      placedRow(1),
      placedRow(2, { customer_id: OTHER_CUSTOMER }),
      placedRow(3, { state: 'placing', order_id: 'order-3', summary: null, placed_at: null }),
    ])
    expect((await index.getCustomerOrder(STORE, CUSTOMER, 'order-1'))?.orderId).toBe('order-1')
    expect(await index.getCustomerOrder(STORE, CUSTOMER, 'order-2')).toBeNull()
    expect(await index.getCustomerOrder(STORE, CUSTOMER, 'order-3')).toBeNull()
    expect(await index.getCustomerOrder(STORE, CUSTOMER, '')).toBeNull()
  })

  it('logs and hides a row whose summary is unreadable', async () => {
    const { index, log } = await setup([placedRow(1, { summary: { lines: 'x' } })])
    expect(await index.getCustomerOrder(STORE, CUSTOMER, 'order-1')).toBeNull()
    expect(log.error).toHaveBeenCalledWith('unreadable order summary', expect.objectContaining({ id: uuid(1001) }))
  })
})

describe('listCustomerOrders', () => {
  it('pages newest first with a cursor that round-trips, placed rows only', async () => {
    const seed = [
      ...Array.from({ length: 25 }, (_, i) => placedRow(i + 1)),
      placedRow(40, { state: 'failed', order_id: null, summary: null, placed_at: null }),
      placedRow(41, { customer_id: OTHER_CUSTOMER }),
    ]
    const { index } = await setup(seed)
    const first = await index.listCustomerOrders(STORE, CUSTOMER, { limit: 10 })
    if (!first.ok) throw new Error('expected a page')
    expect(first.orders.map((row) => row.orderId)).toEqual(Array.from({ length: 10 }, (_, i) => `order-${25 - i}`))
    expect(first.nextCursor).not.toBeNull()

    const seen = [...first.orders]
    let cursor = first.nextCursor
    while (cursor) {
      const page = await index.listCustomerOrders(STORE, CUSTOMER, { limit: 10, cursor })
      if (!page.ok) throw new Error('expected a page')
      seen.push(...page.orders)
      cursor = page.nextCursor
    }
    expect(seen.map((row) => row.orderId)).toEqual(Array.from({ length: 25 }, (_, i) => `order-${25 - i}`))
  })

  it('caps a page at 20 and breaks created_at ties by id', async () => {
    const tied = Array.from({ length: 22 }, (_, i) => placedRow(i + 1, { created_at: stamp(1) }))
    const { index } = await setup(tied)
    const first = await index.listCustomerOrders(STORE, CUSTOMER, { limit: 500 })
    if (!first.ok) throw new Error('expected a page')
    expect(first.orders).toHaveLength(20)
    const second = await index.listCustomerOrders(STORE, CUSTOMER, { cursor: first.nextCursor })
    if (!second.ok) throw new Error('expected a page')
    expect(second.orders).toHaveLength(2)
    expect(second.nextCursor).toBeNull()
    const ids = [...first.orders, ...second.orders].map((row) => row.id)
    expect(new Set(ids).size).toBe(22)
  })

  it('skips an unreadable row (logged) without stalling the page', async () => {
    const { index, log } = await setup([placedRow(1), placedRow(2, { summary: null }), placedRow(3)])
    const page = await index.listCustomerOrders(STORE, CUSTOMER)
    if (!page.ok) throw new Error('expected a page')
    expect(page.orders.map((row) => row.orderId)).toEqual(['order-3', 'order-1'])
    expect(log.error).toHaveBeenCalledWith('placed row without a summary', { id: uuid(1002) })
  })

  it('keeps paging when the last row of a page is unreadable', async () => {
    const { index } = await setup([placedRow(1), placedRow(2, { summary: { bad: true } }), placedRow(3)])
    const first = await index.listCustomerOrders(STORE, CUSTOMER, { limit: 2 })
    if (!first.ok) throw new Error('expected a page')
    expect(first.orders.map((row) => row.orderId)).toEqual(['order-3'])
    const second = await index.listCustomerOrders(STORE, CUSTOMER, { limit: 2, cursor: first.nextCursor })
    if (!second.ok) throw new Error('expected a page')
    expect(second.orders.map((row) => row.orderId)).toEqual(['order-1'])
  })

  it('refuses a tampered cursor', async () => {
    const { index } = await setup([placedRow(1)])
    const { encodeOrderCursor } = await loadCursor()
    const forged = [
      'not base64!',
      Buffer.from('2026-11-04T10:00:00Z').toString('base64url'),
      Buffer.from(`2026-11-04T10:00:00Z|${uuid(1)}|extra`).toString('base64url'),
      Buffer.from(`yesterday|${uuid(1)}`).toString('base64url'),
      Buffer.from('2026-11-04T10:00:00Z|1 or 1=1').toString('base64url'),
      Buffer.from(`2026-11-04T10:00:00Z",id.gt.0|${uuid(1)}`).toString('base64url'),
      encodeOrderCursor({ createdAt: '2026-13-45T99:99:99Z', id: uuid(1) }),
      'A'.repeat(500),
    ]
    for (const cursor of forged) {
      expect(await index.listCustomerOrders(STORE, CUSTOMER, { cursor })).toEqual({ ok: false, error: 'bad_cursor' })
    }
  })
})

describe('order cursor', () => {
  it('round-trips a Postgres timestamp exactly', async () => {
    const { encodeOrderCursor, decodeOrderCursor } = await loadCursor()
    const cursor = { createdAt: '2026-11-04T10:00:00.123456+00:00', id: uuid(7) }
    expect(decodeOrderCursor(encodeOrderCursor(cursor))).toEqual(cursor)
    expect(encodeOrderCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

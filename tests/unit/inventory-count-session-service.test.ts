/**
 * Opening, joining, and closing a stock count.
 *
 * `count-session.ts` decides what a finished count is worth; this is what
 * records one happening. The things worth pinning here are the ones a pure test
 * cannot see: that the denominator is captured ONCE at the moment the count
 * opens, that two people starting a count end up in the same count rather than
 * two half-counts of the same shelf, and that closing writes both facts that
 * say it is closed.
 *
 * Every failure below has the same shape — it ends with a merchant believing a
 * shelf was accounted for when nobody finished looking at it.
 */

import {
  openCount,
  closeCount,
  getOpenCount,
  getCountProgress,
} from '@/lib/inventory/count-session-service'
import type { BranchScope } from '@/lib/outlets/branch-scope'

const TENANT = 'tenant-1'
const NORTH = 'o-north'
const SOUTH = 'o-south'
const COUNT = 'count-1'

const ALL: BranchScope = { kind: 'all' }
const AT_NORTH: BranchScope = { kind: 'branch', outletId: NORTH }

const from = jest.fn()
const scope = jest.fn<Promise<BranchScope>, unknown[]>()

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ from: (...a: unknown[]) => from(...a), auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } } }) } }),
}))
jest.mock('@/lib/inventory/acting-branch-scope', () => ({
  resolveActingBranchScope: (...a: unknown[]) => scope(...a),
}))

interface Writes {
  inserts: Array<{ table: string; rows: Record<string, unknown> }>
  updates: Array<{ table: string; patch: Record<string, unknown> }>
  /** Every `.eq()` asked for, per table — so a dropped filter is visible. */
  filters: Array<{ table: string; column: string; value: unknown }>
}

/**
 * Answers per table and captures what was written. The payloads ARE the thing
 * under test — a snapshot denominator that is silently recomputed looks
 * identical from the outside.
 */
function stub(options: {
  openSession?: Record<string, unknown> | null
  session?: Record<string, unknown> | null
  items?: Array<Record<string, unknown>>
  movements?: Array<Record<string, unknown>>
} = {}): Writes {
  const writes: Writes = { inserts: [], updates: [], filters: [] }

  const items = options.items ?? [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }]
  const movements = options.movements ?? []
  // `session` is what a lookup BY ID returns; `openSession` is what the
  // "is one already running on this shelf" lookup returns.
  const openSession = options.openSession ?? null
  const session =
    options.session === undefined
      ? { id: COUNT, tenant_id: TENANT, outlet_id: null, business_day: '2026-07-31', status: 'open', expected_item_count: 3, closed_at: null }
      : options.session

  from.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        writes.filters.push({ table, column, value })
        return chain
      },
      is: (column: string, value: unknown) => {
        writes.filters.push({ table, column, value })
        return chain
      },
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () =>
        Promise.resolve({ data: table === 'inventory_counts' ? openSession : null, error: null }),
      single: () =>
        Promise.resolve({
          data: table === 'inventory_counts' ? session : null,
          error: null,
        }),
      then: (resolve: (v: unknown) => void) =>
        resolve({
          data: table === 'inventory_items' ? items : table === 'stock_movements' ? movements : [],
          error: null,
        }),
      insert: (rows: Record<string, unknown>) => {
        writes.inserts.push({ table, rows })
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { ...rows, id: COUNT }, error: null }),
          }),
        }
      },
      update: (patch: Record<string, unknown>) => {
        writes.updates.push({ table, patch })
        return chain
      },
    }
    return chain
  })

  return writes
}

beforeEach(() => {
  from.mockReset()
  scope.mockReset()
  scope.mockResolvedValue(ALL)
})

describe('opening a count', () => {
  it('captures how many ingredients were in scope at the moment it opened', async () => {
    // THE POINT OF THE SNAPSHOT. A denominator read live at report time would
    // quietly demote this finished count to a partial one the day somebody adds
    // a fourth ingredient.
    const writes = stub({ items: [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }] })

    await openCount(TENANT, {})

    expect(writes.inserts[0].rows.expected_item_count).toBe(3)
  })

  it('leaves a retired ingredient out of the denominator', async () => {
    // An ingredient nobody stocks any more can never be counted, so including
    // it would make every complete count read as permanently partial — and a
    // caveat that appears on every good day stops being read.
    const writes = stub({ items: [{ id: 'i1' }, { id: 'i2' }] })

    await openCount(TENANT, {})

    expect(writes.inserts[0].rows.expected_item_count).toBe(2)
    // The count above would pass just as happily with the filter deleted — the
    // stub decides how many rows come back. This is the assertion that actually
    // holds the rule.
    expect(writes.filters).toContainEqual({
      table: 'inventory_items',
      column: 'is_active',
      value: true,
    })
  })

  it('opens with no closing timestamp, so nothing reads it as finished', async () => {
    const writes = stub()

    await openCount(TENANT, {})

    expect(writes.inserts[0].rows.status).toBe('open')
    expect(writes.inserts[0].rows.closed_at ?? null).toBeNull()
  })

  it('files the count under a Manila business day', async () => {
    // A count that runs from 23:40 to 00:20 is one count of one day's shelf.
    const writes = stub()

    await openCount(TENANT, {})

    expect(writes.inserts[0].rows.business_day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('refuses to open a count on another branch, and writes nothing', async () => {
    scope.mockResolvedValue(AT_NORTH)
    const writes = stub()

    await expect(openCount(TENANT, { outletId: SOUTH })).rejects.toThrow(/your own branch/i)
    expect(writes.inserts).toHaveLength(0)
  })

  it('joins the count already running on this shelf instead of starting a second', async () => {
    // Two open counts mean two people counting the same sack into different
    // documents, and each would then report partial coverage of a shelf that
    // was actually counted twice over.
    const writes = stub({
      openSession: {
        id: 'already-open',
        tenant_id: TENANT,
        outlet_id: null,
        business_day: '2026-07-31',
        status: 'open',
        expected_item_count: 9,
        closed_at: null,
      },
    })

    const session = await openCount(TENANT, {})

    expect(session.id).toBe('already-open')
    expect(writes.inserts).toHaveLength(0)
    // The original denominator survives — rejoining must not re-snapshot it.
    expect(session.expectedItemCount).toBe(9)
  })
})

describe('closing a count', () => {
  it('writes the status and the timestamp together', async () => {
    // The schema rejects one without the other. This pins that the service
    // never tries: a row saying closed with no timestamp reads as finished to
    // one query and as running to another, and the report would then disagree
    // with itself about whether the shelf was accounted for.
    const writes = stub()

    await closeCount(TENANT, COUNT)

    const patch = writes.updates[0].patch
    expect(patch.status).toBe('closed')
    expect(typeof patch.closed_at).toBe('string')
  })

  it('refuses to close a count that is already closed', async () => {
    // Re-closing would move `closed_at` forward, and that timestamp is the
    // evidence for when the shelf was last accounted for.
    stub({
      session: {
        id: COUNT,
        tenant_id: TENANT,
        outlet_id: null,
        business_day: '2026-07-31',
        status: 'closed',
        expected_item_count: 3,
        closed_at: '2026-07-31T06:00:00.000Z',
      },
    })

    await expect(closeCount(TENANT, COUNT)).rejects.toThrow(/already closed/i)
  })
})

describe('reading a count back', () => {
  it('reports how far a running count has got', async () => {
    stub({
      openSession: {
        id: COUNT,
        tenant_id: TENANT,
        outlet_id: null,
        business_day: '2026-07-31',
        status: 'open',
        expected_item_count: 4,
        closed_at: null,
      },
    })

    const session = await getOpenCount(TENANT, null)

    expect(session?.id).toBe(COUNT)
    expect(session?.expectedItemCount).toBe(4)
  })

  it('says nothing is running when nothing is', async () => {
    stub({ openSession: null })

    expect(await getOpenCount(TENANT, null)).toBeNull()
  })

  it('judges progress from the movements filed under the session', async () => {
    stub({
      session: {
        id: COUNT,
        tenant_id: TENANT,
        outlet_id: null,
        business_day: '2026-07-31',
        status: 'closed',
        expected_item_count: 4,
        closed_at: '2026-07-31T06:00:00.000Z',
      },
      movements: [{ inventory_item_id: 'i1' }, { inventory_item_id: 'i2' }],
    })

    const progress = await getCountProgress(TENANT, COUNT)

    expect(progress?.state).toBe('partial')
    expect(progress?.countedCount).toBe(2)
    expect(progress?.expectedCount).toBe(4)
  })

  it('counts a recounted ingredient once', async () => {
    // Recounting the flour three times because the number looked wrong is good
    // practice; reading it as three ingredients would let one stubborn sack
    // report a finished count.
    stub({
      session: {
        id: COUNT,
        tenant_id: TENANT,
        outlet_id: null,
        business_day: '2026-07-31',
        status: 'closed',
        expected_item_count: 3,
        closed_at: '2026-07-31T06:00:00.000Z',
      },
      movements: [
        { inventory_item_id: 'flour' },
        { inventory_item_id: 'flour' },
        { inventory_item_id: 'flour' },
      ],
    })

    const progress = await getCountProgress(TENANT, COUNT)

    expect(progress?.countedCount).toBe(1)
    expect(progress?.state).toBe('partial')
  })

  it('returns nothing for a count this store does not own', async () => {
    stub({ session: null })

    expect(await getCountProgress(TENANT, 'someone-elses-count')).toBeNull()
  })
})

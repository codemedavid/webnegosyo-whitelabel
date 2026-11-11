/**
 * @jest-environment node
 *
 * `readAllRows` pages past PostgREST's 1,000-row cap. Run against the fake
 * tables fixture, which caps every response the way the platform project
 * does, so a pager that stops early fails here as it would in production.
 */
import { readAll } from '@/lib/texts/server/paged'
import { MAX_PAGE_SIZE, readAllRows, type PageQuery } from '@/platform/db/read-all-rows'
import { fakeSupabaseTables, PLATFORM_MAX_ROWS } from '../../fixtures/fake-supabase-tables'

interface OrderRow {
  id: number
  tenant_id: string
}

function seed(count: number): OrderRow[] {
  return Array.from({ length: count }, (_, index) => ({ id: index + 1, tenant_id: 't1' }))
}

/** The store's orders, newest id first, plus the windows that were requested. */
function orders(count: number) {
  const fake = fakeSupabaseTables({ orders: [...seed(count), { id: 999_999, tenant_id: 'other-store' }] })
  const query: PageQuery<OrderRow> = (from, to) =>
    fake.client.from('orders').select('id, tenant_id').eq('tenant_id', 't1').order('id', { ascending: false }).range(from, to)
  const windows = () => fake.requests.map((request) => [request.from, request.to])
  return { query, windows }
}

const ids = (rows: readonly OrderRow[]) => rows.map((row) => row.id)
const descending = (count: number) => seed(count).map((row) => row.id).reverse()

describe('readAllRows', () => {
  it('matches the platform cap (guards the premise)', () => {
    expect(MAX_PAGE_SIZE).toBe(PLATFORM_MAX_ROWS)
  })

  it('reads a set smaller than one page in one request', async () => {
    const { query, windows } = orders(37)

    const result = await readAllRows(query, { maxRows: 5_000 })

    expect(result.ok && ids(result.rows)).toEqual(descending(37))
    expect(windows()).toEqual([[0, 999]])
  })

  it('reads an empty set', async () => {
    const { query } = orders(0)

    expect(await readAllRows(query, { maxRows: 5_000 })).toEqual({ ok: true, rows: [] })
  })

  it('reads exactly 1000 rows, and asks once more to learn there is nothing after them', async () => {
    const { query, windows } = orders(1000)

    const result = await readAllRows(query, { maxRows: 5_000 })

    expect(result.ok && result.rows).toHaveLength(1000)
    expect(windows()).toEqual([[0, 999], [1000, 1999]])
  })

  it('reads the 1001st row, the one a single request never returns', async () => {
    const { query, windows } = orders(1001)

    const result = await readAllRows(query, { maxRows: 5_000 })

    expect(result.ok && ids(result.rows)).toEqual(descending(1001))
    expect(windows()).toEqual([[0, 999], [1000, 1999]])
  })

  it('reads 2500 rows across three pages, each row once, in order', async () => {
    const { query, windows } = orders(2500)

    const result = await readAllRows(query, { maxRows: 5_000 })

    expect(result.ok && ids(result.rows)).toEqual(descending(2500))
    expect(windows()).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('returns the error from page 2 and none of page 1, rather than a table with a hole in it', async () => {
    const { query } = orders(2500)
    const failing: PageQuery<OrderRow> = (from, to) =>
      from >= 1000
        ? Promise.resolve({ data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } })
        : query(from, to)

    const result = await readAllRows(failing, { maxRows: 5_000 })

    expect(result).toEqual({
      ok: false,
      reason: 'error',
      error: { message: 'canceling statement due to statement timeout', code: '57014' },
    })
    expect('rows' in result).toBe(false)
  })

  it('turns a thrown query into the same error result', async () => {
    const throwing: PageQuery<OrderRow> = () => {
      throw new Error('fetch failed')
    }

    expect(await readAllRows(throwing, { maxRows: 10 })).toEqual({ ok: false, reason: 'error', error: { message: 'fetch failed' } })
  })

  it('says so when the set is larger than maxRows, instead of returning a short list as if it were whole', async () => {
    const { query, windows } = orders(2500)

    const result = await readAllRows(query, { maxRows: 2_000 })

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ reason: 'too-many-rows', maxRows: 2_000 })
    expect(!result.ok && result.reason === 'too-many-rows' && ids(result.rows)).toEqual(descending(2500).slice(0, 2_000))
    // Two full pages, then one row past the ceiling to tell "exactly maxRows" from "more".
    expect(windows()).toEqual([[0, 999], [1000, 1999], [2000, 2000]])
  })

  it('accepts a set of exactly maxRows', async () => {
    const { query } = orders(2000)

    const result = await readAllRows(query, { maxRows: 2_000 })

    expect(result.ok && result.rows).toHaveLength(2000)
  })

  it('never asks for a row past maxRows on the last page', async () => {
    const { query, windows } = orders(2500)

    const result = await readAllRows(query, { maxRows: 1_500 })

    expect(result.ok).toBe(false)
    expect(windows()).toEqual([[0, 999], [1000, 1499], [1500, 1500]])
    expect(!result.ok && result.reason === 'too-many-rows' && result.rows).toHaveLength(1_500)
  })

  it('pages in smaller steps when asked', async () => {
    const { query, windows } = orders(1200)

    const result = await readAllRows(query, { maxRows: 5_000, pageSize: 500 })

    expect(result.ok && ids(result.rows)).toEqual(descending(1200))
    expect(windows()).toEqual([[0, 499], [500, 999], [1000, 1499]])
  })

  it('refuses a page size above the server cap: a capped page would look like the last one', async () => {
    const { query } = orders(10)

    await expect(readAllRows(query, { maxRows: 5_000, pageSize: 1001 })).rejects.toThrow(RangeError)
    await expect(readAllRows(query, { maxRows: 5_000, pageSize: 0 })).rejects.toThrow(RangeError)
    await expect(readAllRows(query, { maxRows: 0 })).rejects.toThrow(RangeError)
    await expect(readAllRows(query, { maxRows: 2.5 })).rejects.toThrow(RangeError)
  })

  it('shows why paging is needed: the same query without it stops at the cap and says nothing', async () => {
    const fake = fakeSupabaseTables({ orders: seed(2500) })

    const { data, error } = await fake.client.from('orders').select('id').eq('tenant_id', 't1')

    expect(error).toBeNull()
    expect(data).toHaveLength(1000)
  })

  it('returns what the existing texts pager returns for the same query, so that pager can sit on top of this one', async () => {
    const mine = orders(2500)
    const theirs = orders(2500)

    const result = await readAllRows(mine.query, { maxRows: 50_000 })
    const existing = await readAll<OrderRow>('orders', theirs.query, { maxRows: 50_000 })

    expect(result.ok && result.rows).toEqual(existing)
    expect(mine.windows()).toEqual(theirs.windows())
  })
})

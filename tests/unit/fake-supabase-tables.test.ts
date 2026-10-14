/**
 * The in-memory Supabase used by read-seam tests (plan §10.2, layer L2).
 *
 * It must fail the way the platform fails: PostgREST answers at most
 * `max-rows` (1000) rows per request and says nothing about the rest, so a
 * reader that forgets to page sums a truncated day without an error. A fake
 * without that cap passes every such reader.
 */
import { PLATFORM_MAX_ROWS, fakeSupabaseTables, type FakeRow } from '../fixtures/fake-supabase-tables'

function rows(count: number): FakeRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `r-${String(i).padStart(5, '0')}`,
    tenant_id: i % 10 === 0 ? 'other' : 't1',
    n: i,
    at: new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(),
    status: i % 7 === 0 ? 'cancelled' : 'confirmed',
    note: i % 3 === 0 ? null : `note-${i}`,
  }))
}

describe('fakeSupabaseTables — the platform row cap', () => {
  it('caps the platform at 1000 rows, like PostgREST max-rows', () => {
    expect(PLATFORM_MAX_ROWS).toBe(1000)
  })

  it('answers at most 1000 rows to an unpaged read, without an error', async () => {
    const { client } = fakeSupabaseTables({ things: rows(1001) })

    const { data, error } = await client.from('things').select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1000)
  })

  it('caps a range wider than the cap, too', async () => {
    const { client } = fakeSupabaseTables({ things: rows(2500) })

    const { data } = await client.from('things').select('id').range(0, 1999)

    expect(data).toHaveLength(1000)
  })

  it('serves every row to a reader that pages', async () => {
    const { client } = fakeSupabaseTables({ things: rows(2001) })
    const read: FakeRow[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await client.from('things').select('id').order('id').range(from, from + 999)
      read.push(...(data ?? []))
      if ((data ?? []).length < 1000) break
    }

    expect(read).toHaveLength(2001)
    expect(new Set(read.map((row) => row.id)).size).toBe(2001)
  })

  it('takes a different cap for a per-tenant project', async () => {
    const { client } = fakeSupabaseTables({ things: rows(30) }, {}, { maxRows: 10 })

    const { data } = await client.from('things').select('id')

    expect(data).toHaveLength(10)
  })

  it('records each request with its window, so a test can count pages', async () => {
    const fake = fakeSupabaseTables({ things: rows(1500) })

    await fake.client.from('things').select('id').range(0, 999)
    await fake.client.from('things').select('id').range(1000, 1999)

    expect(fake.requests).toEqual([
      { table: 'things', from: 0, to: 999, returned: 1000 },
      { table: 'things', from: 1000, to: 1999, returned: 500 },
    ])
    expect(fake.seen).toEqual(['things', 'things'])
  })
})

describe('fakeSupabaseTables — filters', () => {
  async function ids(build: (q: ReturnType<ReturnType<typeof fakeSupabaseTables>['client']['from']>) => PromiseLike<{ data: unknown }>) {
    const { client } = fakeSupabaseTables({ things: rows(30) })
    const { data } = await build(client.from('things'))
    return (data as FakeRow[]).map((row) => row.n)
  }

  it('compares numbers as numbers and ISO instants in time order', async () => {
    expect(await ids((q) => q.select('n').gte('n', 25))).toEqual([25, 26, 27, 28, 29])
    expect(await ids((q) => q.select('n').lt('n', 3))).toEqual([0, 1, 2])
    expect(await ids((q) => q.select('n').gt('n', 27).lte('n', 29))).toEqual([28, 29])
    const at5 = new Date(Date.UTC(2026, 9, 1) + 5 * 60_000).toISOString()
    const at7 = new Date(Date.UTC(2026, 9, 1) + 7 * 60_000).toISOString()
    expect(await ids((q) => q.select('n').gte('at', at5).lt('at', at7))).toEqual([5, 6])
  })

  it('supports eq, neq, in and is', async () => {
    expect(await ids((q) => q.select('n').eq('tenant_id', 'other'))).toEqual([0, 10, 20])
    expect((await ids((q) => q.select('n').neq('tenant_id', 't1')))).toEqual([0, 10, 20])
    expect(await ids((q) => q.select('n').in('n', [1, 2, 99]))).toEqual([1, 2])
    expect(await ids((q) => q.select('n').is('note', null).lt('n', 7))).toEqual([0, 3, 6])
  })

  it("supports not(column, 'in', '(a,b)') and not(column, 'is', null) as PostgREST spells them", async () => {
    expect(await ids((q) => q.select('n').not('status', 'in', '(cancelled,refunded)').lt('n', 9))).toEqual([1, 2, 3, 4, 5, 6, 8])
    expect(await ids((q) => q.select('n').not('note', 'is', null).lt('n', 5))).toEqual([1, 2, 4])
  })

  it('refuses a filter operator it does not model, instead of passing every row', () => {
    const { client } = fakeSupabaseTables({ things: rows(3) })

    expect(() => client.from('things').select('n').not('n', 'like', '1%')).toThrow(/not\(n, like\)/)
  })
})

describe('fakeSupabaseTables — ordering, windows, projection', () => {
  it('orders by several columns, the first one deciding', async () => {
    const { client } = fakeSupabaseTables({
      things: [
        { id: 'b', day: 2 },
        { id: 'a', day: 2 },
        { id: 'c', day: 1 },
      ],
    })

    const { data } = await client.from('things').select('id').order('day', { ascending: false }).order('id')

    expect(data).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
  })

  it('sorts numbers numerically and puts nulls where Postgres does', async () => {
    const { client } = fakeSupabaseTables({
      things: [{ v: 10 }, { v: null }, { v: 9 }, { v: 100 }],
    })

    const ascending = await client.from('things').select('v').order('v')
    const descending = await client.from('things').select('v').order('v', { ascending: false })

    expect((ascending.data as FakeRow[]).map((row) => row.v)).toEqual([9, 10, 100, null])
    expect((descending.data as FakeRow[]).map((row) => row.v)).toEqual([null, 100, 10, 9])
  })

  it('applies the window after the order, whatever order the calls came in', async () => {
    const { client } = fakeSupabaseTables({ things: rows(10) })

    const { data } = await client.from('things').select('n').range(0, 2).order('n', { ascending: false })

    expect((data as FakeRow[]).map((row) => row.n)).toEqual([9, 8, 7])
  })

  it('limits', async () => {
    const { client } = fakeSupabaseTables({ things: rows(10) })

    const { data } = await client.from('things').select('n').order('n').limit(2)

    expect(data).toEqual([{ n: 0 }, { n: 1 }])
  })

  it('projects only the selected columns, so a forgotten column shows up missing', async () => {
    const { client } = fakeSupabaseTables({ things: rows(1) })

    const { data } = await client.from('things').select('id, n')

    expect(data).toEqual([{ id: 'r-00000', n: 0 }])
  })

  it('returns whole rows for select *', async () => {
    const { client } = fakeSupabaseTables({ things: rows(1) })

    const { data } = await client.from('things').select('*')

    expect(Object.keys((data as FakeRow[])[0])).toEqual(['id', 'tenant_id', 'n', 'at', 'status', 'note'])
  })

  it('counts every matching row with count: exact, past the cap', async () => {
    const { client } = fakeSupabaseTables({ things: rows(1200) })

    const full = await client.from('things').select('id', { count: 'exact' }).eq('tenant_id', 't1')
    const head = await client.from('things').select('id', { count: 'exact', head: true })

    expect(full.count).toBe(1080)
    expect(full.data).toHaveLength(1000)
    expect(head.count).toBe(1200)
    expect(head.data).toBeNull()
  })

  it('maybeSingle and single', async () => {
    const { client } = fakeSupabaseTables({ things: rows(3) })

    expect((await client.from('things').select('n').eq('n', 1).maybeSingle()).data).toEqual({ n: 1 })
    expect((await client.from('things').select('n').eq('n', 99).maybeSingle()).data).toBeNull()
    expect((await client.from('things').select('n').eq('n', 2).single()).data).toEqual({ n: 2 })
    expect((await client.from('things').select('n').single()).error).not.toBeNull()
  })

  it('fails a table on demand, with no rows', async () => {
    const { client } = fakeSupabaseTables({ things: rows(3) }, { things: 'permission denied' })

    const result = await client.from('things').select('n')

    expect(result).toEqual(expect.objectContaining({ data: null, error: { message: 'permission denied' } }))
  })

  it('never lets a test mutate the seeded rows', async () => {
    const seed = rows(2)
    const { client } = fakeSupabaseTables({ things: seed })

    const { data } = await client.from('things').select('*')
    ;(data as FakeRow[])[0].n = 999

    expect(seed[0].n).toBe(0)
  })
})

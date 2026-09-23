/**
 * PostgREST silently caps every response at 1000 rows (`max-rows`). The menu
 * read had no `.range()`, so a 4066-item store showed its first 1000 dishes
 * and the other 3066 simply never existed on the storefront. `selectAllPages`
 * walks the ranges until the table is exhausted.
 */
import { selectAllPages, type PageRequest } from '@/lib/storefront/paged-select'

interface Row { id: string }

function makeRows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({ id: `item-${String(index).padStart(5, '0')}` }))
}

/** A fake table that honours ranges and, optionally, reports an exact count. */
function makeTable(rows: Row[], options: { hasCount?: boolean; failOnFrom?: number } = {}) {
  const requests: PageRequest[] = []
  const query = async (request: PageRequest) => {
    requests.push(request)
    if (options.failOnFrom === request.from) {
      return { data: null, error: { message: 'upstream request timeout' }, count: null }
    }
    return {
      data: rows.slice(request.from, request.to + 1),
      error: null,
      count: request.withCount && options.hasCount !== false ? rows.length : null,
    }
  }
  return { query, requests }
}

describe('selectAllPages', () => {
  test('returns a table smaller than one page from a single request', async () => {
    const { query, requests } = makeTable(makeRows(12))

    const result = await selectAllPages(query, { pageSize: 1000 })

    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(12)
    expect(requests).toHaveLength(1)
  })

  test('reads every row past the 1000-row cap', async () => {
    const rows = makeRows(4066)
    const { query, requests } = makeTable(rows)

    const result = await selectAllPages(query, { pageSize: 1000 })

    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(4066)
    expect(result.data.map((row) => row.id)).toEqual(rows.map((row) => row.id))
    expect(requests.map((request) => [request.from, request.to])).toEqual([
      [0, 999], [1000, 1999], [2000, 2999], [3000, 3999], [4000, 4999],
    ])
    expect(result.isTruncated).toBe(false)
  })

  test('asks for the count only on the first page', async () => {
    const { query, requests } = makeTable(makeRows(2500))

    await selectAllPages(query, { pageSize: 1000 })

    expect(requests.filter((request) => request.withCount)).toHaveLength(1)
    expect(requests[0].withCount).toBe(true)
  })

  test('walks page by page when the count is unavailable', async () => {
    const { query, requests } = makeTable(makeRows(2100), { hasCount: false })

    const result = await selectAllPages(query, { pageSize: 1000 })

    expect(result.data).toHaveLength(2100)
    expect(requests).toHaveLength(3)
  })

  test('stops at the row ceiling and says so', async () => {
    const { query } = makeTable(makeRows(3500))
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await selectAllPages(query, { pageSize: 1000, maxRows: 2000, label: 'menu_items' })

    expect(result.data).toHaveLength(2000)
    expect(result.isTruncated).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  test('stops at the row ceiling without a count, too', async () => {
    const { query, requests } = makeTable(makeRows(3500), { hasCount: false })
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await selectAllPages(query, { pageSize: 1000, maxRows: 2000 })

    expect(result.data).toHaveLength(2000)
    expect(result.isTruncated).toBe(true)
    expect(requests).toHaveLength(2)
    warn.mockRestore()
  })

  test('fails the whole read when any page fails, rather than returning a partial table', async () => {
    const { query } = makeTable(makeRows(3000), { failOnFrom: 2000 })

    const result = await selectAllPages(query, { pageSize: 1000 })

    expect(result.error).toEqual({ message: 'upstream request timeout' })
    expect(result.data).toEqual([])
  })

  test('fails when the first page fails', async () => {
    const { query } = makeTable(makeRows(10), { failOnFrom: 0 })

    const result = await selectAllPages(query, { pageSize: 1000 })

    expect(result.error?.message).toBe('upstream request timeout')
  })

  test('drops a row that shifted into two pages between requests', async () => {
    // A row inserted mid-read shifts the next page by one, so its first row
    // repeats the previous page's last row.
    const rows = makeRows(1500)
    const query = async (request: PageRequest) => {
      const from = request.from === 0 ? 0 : request.from - 1
      return {
        data: rows.slice(from, request.to + 1),
        error: null,
        count: request.withCount ? rows.length : null,
      }
    }

    const result = await selectAllPages(query, { pageSize: 1000 })

    expect(result.data).toHaveLength(1500)
    expect(new Set(result.data.map((row) => row.id)).size).toBe(1500)
  })
})

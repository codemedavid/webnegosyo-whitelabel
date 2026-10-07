import { readPagesConcurrently, type PageResponse } from '@/lib/dashboard/paged-read'

/** A fake table of `total` numbered rows, served by offset range like PostgREST. */
function table(total: number, failAtFrom?: number) {
  const calls: number[] = []
  const reader = (from: number, to: number): Promise<PageResponse<number>> => {
    calls.push(from)
    if (from === failAtFrom) return Promise.resolve({ data: null, error: { message: 'boom' } })
    const data = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i)
    return Promise.resolve({ data, error: null })
  }
  return { reader, calls }
}

const OPTIONS = { pageSize: 10, maxRows: 100, concurrency: 4 }

describe('readPagesConcurrently', () => {
  test('reads a store that fits in one page with exactly one query', async () => {
    // Arrange
    const { reader, calls } = table(7)

    // Act
    const result = await readPagesConcurrently(reader, OPTIONS)

    // Assert
    expect(result).toEqual({ rows: [0, 1, 2, 3, 4, 5, 6], error: null, truncated: false })
    expect(calls).toEqual([0])
  })

  test('returns every row once, in page order, when the history spans several batches', async () => {
    const { reader } = table(57)

    const result = await readPagesConcurrently(reader, OPTIONS)

    expect(result.rows).toEqual(Array.from({ length: 57 }, (_, i) => i))
    expect(result.truncated).toBe(false)
  })

  test('discards speculative pages past the end instead of appending them', async () => {
    const { reader, calls } = table(20)

    const result = await readPagesConcurrently(reader, OPTIONS)

    expect(result.rows).toHaveLength(20)
    // Page 0 alone, then one batch of four (pages 1–4); pages 2–4 were empty.
    expect(calls).toEqual([0, 10, 20, 30, 40])
  })

  test('flags truncation when the row cap is reached', async () => {
    const { reader } = table(500)

    const result = await readPagesConcurrently(reader, OPTIONS)

    expect(result.rows).toHaveLength(100)
    expect(result.truncated).toBe(true)
  })

  test('fails the whole read when any page errors, never returning a partial history', async () => {
    const { reader } = table(57, 30)

    const result = await readPagesConcurrently(reader, OPTIONS)

    expect(result).toEqual({ rows: [], error: 'boom', truncated: false })
  })
})

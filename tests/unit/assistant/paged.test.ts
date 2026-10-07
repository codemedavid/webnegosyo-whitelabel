import { chunk, readPaged } from '@/lib/assistant/data/paged'

/** A table of `total` rows served the way PostgREST does: never more than `cap` per request. */
function table(total: number, cap = 1000) {
  const rows = Array.from({ length: total }, (_, index) => ({ n: index }))
  const calls: Array<[number, number]> = []
  const readPage = async (from: number, to: number) => {
    calls.push([from, to])
    return { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null }
  }
  return { readPage, calls }
}

describe('readPaged', () => {
  test('reads past the 1000-row API cap instead of stopping at the first page', async () => {
    const { readPage } = table(2500)

    const result = await readPaged(readPage, 5000)

    expect(result.rows).toHaveLength(2500)
    expect(result.isCapped).toBe(false)
  })

  test('says the count is a floor when the ceiling is reached', async () => {
    const { readPage, calls } = table(7000)

    const result = await readPaged(readPage, 5000)

    expect(result.rows).toHaveLength(5000)
    expect(result.isCapped).toBe(true)
    expect(calls).toHaveLength(5)
  })

  test('stops after a short page', async () => {
    const { readPage, calls } = table(10)

    const result = await readPaged(readPage, 5000)

    expect(result.rows).toHaveLength(10)
    expect(calls).toEqual([[0, 999]])
  })

  test('a query error is thrown, never read as zero rows', async () => {
    await expect(readPaged(async () => ({ data: null, error: { message: 'boom' } }), 5000)).rejects.toThrow('boom')
  })
})

describe('chunk', () => {
  test('splits ids into groups of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})

/** readAll: pages past the 1000-row cap; an exact multiple of the cap is not "too many". */

import { PAGE_SIZE, readAll } from '@/lib/texts/server/paged'

function pages(total: number) {
  const calls: Array<[number, number]> = []
  const page = async (from: number, to: number) => {
    calls.push([from, to])
    const count = Math.max(0, Math.min(to, total - 1) - from + 1)
    return { data: Array.from({ length: count }, (_, i) => ({ n: from + i })), error: null }
  }
  return { page, calls }
}

test('exactly maxRows rows is fine (one extra probe, no throw)', async () => {
  const { page } = pages(2 * PAGE_SIZE)
  expect(await readAll('x', page, { maxRows: 2 * PAGE_SIZE })).toHaveLength(2 * PAGE_SIZE)
})

test('one row more than maxRows throws', async () => {
  const { page } = pages(2 * PAGE_SIZE + 1)
  await expect(readAll('x', page, { maxRows: 2 * PAGE_SIZE })).rejects.toThrow('x: more than 2000 rows')
})

test('a short page ends the read', async () => {
  const { page, calls } = pages(10)
  expect(await readAll('x', page)).toHaveLength(10)
  expect(calls).toHaveLength(1)
})

// Pinned before readAll became an adapter over readAllRows (R1, 2026-11-16): same requests, same errors.

test('requests the same windows, including the one-row probe at maxRows', async () => {
  const { page, calls } = pages(2 * PAGE_SIZE)
  await readAll('x', page, { maxRows: 2 * PAGE_SIZE })
  expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2000]])
})

test('a page error throws "<label> could not be read: <message>" through makeError', async () => {
  class SnapshotLike extends Error {}
  const page = async () => ({ data: null, error: { message: 'boom' } })
  const read = readAll('orders', page, { makeError: (message) => new SnapshotLike(message) })
  await expect(read).rejects.toBeInstanceOf(SnapshotLike)
  await expect(readAll('orders', page)).rejects.toThrow('orders could not be read: boom')
  await expect(readAll('orders', page)).rejects.toMatchObject({ name: 'PagedReadError' })
})

test('an error on the probe page throws too', async () => {
  const page = async (from: number, to: number) =>
    from >= PAGE_SIZE ? { data: null, error: { message: 'late' } } : { data: Array.from({ length: to - from + 1 }, () => ({})), error: null }
  await expect(readAll('x', page, { maxRows: PAGE_SIZE })).rejects.toThrow('x could not be read: late')
})

test('a page that THROWS rethrows the same error, unwrapped', async () => {
  const original = new Error('network down')
  const page = async () => { throw original }
  await expect(readAll('x', page, { makeError: () => new Error('wrapped') })).rejects.toBe(original)
})

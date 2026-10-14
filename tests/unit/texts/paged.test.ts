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

/**
 * @jest-environment node
 *
 * The diners' stock ceilings, kept for a few seconds per store + branch so a
 * busy menu does not read the whole stock graph on every view. A sale or a
 * stock movement drops the store's entry; Redis trouble always falls back to a
 * direct read.
 */

type Hash = Map<string, unknown>
const hashes = new Map<string, Hash>()
let isBroken = false
const fakeRedis = {
  hget: jest.fn(async (key: string, field: string) => {
    if (isBroken) throw new Error('redis down')
    return hashes.get(key)?.get(field) ?? null
  }),
  hset: jest.fn(async (key: string, values: Record<string, unknown>) => {
    if (isBroken) throw new Error('redis down')
    const hash = hashes.get(key) ?? new Map()
    for (const [field, value] of Object.entries(values)) hash.set(field, JSON.parse(JSON.stringify(value)))
    hashes.set(key, hash)
    return 1
  }),
  expire: jest.fn(async () => 1),
  del: jest.fn(async (key: string) => {
    if (isBroken) throw new Error('redis down')
    hashes.delete(key)
    return 1
  }),
}
let hasRedis = true
jest.mock('@/lib/redis-cache', () => ({ getRedisClient: () => (hasRedis ? fakeRedis : null) }))

import {
  CEILINGS_CACHE_TTL_MS,
  invalidateStockCeilings,
  readThroughCeilingsCache,
} from '@/lib/inventory/ceilings-cache'

const TENANT = 't-1'
const BRANCH = 'b-1'

beforeEach(() => {
  hashes.clear()
  isBroken = false
  hasRedis = true
  jest.clearAllMocks()
})

describe('readThroughCeilingsCache', () => {
  test('a second view within the window is served without reading the graph again', async () => {
    const read = jest.fn(async () => ({ ceilings: { pizza: 3 } }))
    let clock = 1_000_000
    const now = () => clock

    expect(await readThroughCeilingsCache(TENANT, BRANCH, read, now)).toEqual({ ceilings: { pizza: 3 } })
    clock += CEILINGS_CACHE_TTL_MS - 1
    expect(await readThroughCeilingsCache(TENANT, BRANCH, read, now)).toEqual({ ceilings: { pizza: 3 } })
    expect(read).toHaveBeenCalledTimes(1)
  })

  test('an entry older than the window is read again', async () => {
    const read = jest.fn(async () => ({ ceilings: { pizza: 3 } }))
    let clock = 1_000_000
    await readThroughCeilingsCache(TENANT, BRANCH, read, () => clock)
    clock += CEILINGS_CACHE_TTL_MS + 1
    await readThroughCeilingsCache(TENANT, BRANCH, read, () => clock)
    expect(read).toHaveBeenCalledTimes(2)
  })

  test('each branch, and the store-wide view, has its own entry', async () => {
    const read = jest.fn(async (label: string) => ({ ceilings: { [label]: 1 } }))
    await readThroughCeilingsCache(TENANT, BRANCH, () => read('branch'))
    expect(await readThroughCeilingsCache(TENANT, null, () => read('store'))).toEqual({ ceilings: { store: 1 } })
    expect(await readThroughCeilingsCache('t-2', BRANCH, () => read('other'))).toEqual({ ceilings: { other: 1 } })
    expect(read).toHaveBeenCalledTimes(3)
  })

  test('a sale or stock movement drops every branch of the store', async () => {
    const read = jest.fn(async () => ({ ceilings: { pizza: 3 } }))
    await readThroughCeilingsCache(TENANT, BRANCH, read)
    await readThroughCeilingsCache(TENANT, null, read)
    await invalidateStockCeilings(TENANT)
    await readThroughCeilingsCache(TENANT, BRANCH, read)
    await readThroughCeilingsCache(TENANT, null, read)
    expect(read).toHaveBeenCalledTimes(4)
  })

  test('Redis down or absent = a direct read, never an error', async () => {
    const read = jest.fn(async () => ({ ceilings: {} }))
    isBroken = true
    await expect(readThroughCeilingsCache(TENANT, BRANCH, read)).resolves.toEqual({ ceilings: {} })
    await expect(invalidateStockCeilings(TENANT)).resolves.toBeUndefined()
    hasRedis = false
    await expect(readThroughCeilingsCache(TENANT, BRANCH, read)).resolves.toEqual({ ceilings: {} })
    expect(read).toHaveBeenCalledTimes(2)
  })

  test('a failed read is not cached', async () => {
    const read = jest.fn().mockRejectedValueOnce(new Error('db')).mockResolvedValueOnce({ ceilings: { pizza: 1 } })
    await expect(readThroughCeilingsCache(TENANT, BRANCH, read)).rejects.toThrow('db')
    await expect(readThroughCeilingsCache(TENANT, BRANCH, read)).resolves.toEqual({ ceilings: { pizza: 1 } })
  })

  test('the key expires on its own even if nobody invalidates it', async () => {
    await readThroughCeilingsCache(TENANT, BRANCH, async () => ({ ceilings: {} }))
    expect(fakeRedis.expire).toHaveBeenCalledWith(expect.stringContaining(TENANT), expect.any(Number))
  })
})

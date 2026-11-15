/**
 * `createOnceClaims`: a staff Send tap or a chat alert happens once per key,
 * even on a server without Redis (the instance holds the claim), and a
 * release lets a retry through.
 */
const redis = { set: jest.fn(), del: jest.fn() }
let redisConfigured = false
jest.mock('@/lib/redis-cache', () => ({ getRedisClient: () => (redisConfigured ? redis : null) }))

import { createOnceClaims } from '@/lib/messenger/dedupe'

beforeEach(() => {
  redisConfigured = false
  redis.set.mockReset()
  redis.del.mockReset()
})

describe('createOnceClaims', () => {
  it('without Redis, the instance still refuses the same key twice', async () => {
    const claims = createOnceClaims('test-a', 60)
    expect(await claims.claim('chat-1:tap-1')).toBe(true)
    expect(await claims.claim('chat-1:tap-1')).toBe(false)
    expect(await claims.claim('chat-1:tap-2')).toBe(true)
  })

  it('a release lets the same key through again', async () => {
    const claims = createOnceClaims('test-b', 60)
    await claims.claim('k')
    await claims.release('k')
    expect(await claims.claim('k')).toBe(true)
  })

  it('another instance holding it in Redis wins; Redis down fails open', async () => {
    redisConfigured = true
    redis.set.mockResolvedValueOnce(null)
    expect(await createOnceClaims('test-c', 60).claim('k')).toBe(false)
    redis.set.mockRejectedValueOnce(new Error('down'))
    expect(await createOnceClaims('test-d', 60).claim('k')).toBe(true)
    expect(redis.set).toHaveBeenLastCalledWith(expect.stringMatching(/^msgr:test-d:/), '1', { nx: true, ex: 60 })
  })

  it('never puts the raw key in Redis', async () => {
    redisConfigured = true
    redis.set.mockResolvedValueOnce('OK')
    await createOnceClaims('test-e', 60).claim('24000000000000009:tap')
    expect(redis.set.mock.calls[0][0]).not.toContain('24000000000000009')
  })
})

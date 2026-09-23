/**
 * Redis-backed fixed-window rate limiter.
 *
 * The in-memory limiter lives in one serverless instance, so on Vercel every
 * cold instance starts a fresh count — a scripted caller is effectively
 * unlimited. This limiter counts in Upstash Redis, and must FAIL OPEN: a Redis
 * outage may never stop a customer from ordering.
 */

jest.mock('@/lib/redis-cache', () => ({
  getRedisClient: jest.fn(),
}))

interface FakePipeline {
  incr: jest.Mock
  expire: jest.Mock
  exec: jest.Mock
}

function fakeRedis(exec: () => Promise<unknown>) {
  const pipeline: FakePipeline = {
    incr: jest.fn(),
    expire: jest.fn(),
    exec: jest.fn(exec),
  }
  pipeline.incr.mockReturnValue(pipeline)
  pipeline.expire.mockReturnValue(pipeline)
  return { client: { pipeline: jest.fn(() => pipeline) }, pipeline }
}

async function load() {
  const redisCache = await import('@/lib/redis-cache')
  const limiter = await import('@/lib/distributed-rate-limit')
  return { getRedisClient: jest.mocked(redisCache.getRedisClient), ...limiter }
}

describe('checkRateLimit (distributed)', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('allows a request whose window count is within the limit', async () => {
    // Arrange
    const { getRedisClient, checkRateLimit } = await load()
    const { client, pipeline } = fakeRedis(async () => [3, 1])
    getRedisClient.mockReturnValue(client as never)

    // Act
    const result = await checkRateLimit('voucher:1.2.3.4', { limit: 5, windowSec: 60 })

    // Assert
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
    expect(pipeline.incr).toHaveBeenCalledWith(expect.stringContaining('voucher:1.2.3.4'))
    expect(pipeline.expire).toHaveBeenCalledWith(expect.any(String), expect.any(Number))
  })

  it('refuses once the shared count exceeds the limit', async () => {
    const { getRedisClient, checkRateLimit } = await load()
    const { client } = fakeRedis(async () => [6, 1])
    getRedisClient.mockReturnValue(client as never)

    const result = await checkRateLimit('voucher:1.2.3.4', { limit: 5, windowSec: 60 })

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfterSec).toBeGreaterThan(0)
    expect(result.retryAfterSec).toBeLessThanOrEqual(60)
  })

  it('keys each fixed window separately so a count cannot outlive its window', async () => {
    const { getRedisClient, checkRateLimit } = await load()
    const { client, pipeline } = fakeRedis(async () => [1, 1])
    getRedisClient.mockReturnValue(client as never)
    const now = jest.spyOn(Date, 'now')

    now.mockReturnValue(1_000_000_000)
    await checkRateLimit('k', { limit: 5, windowSec: 60 })
    now.mockReturnValue(1_000_000_000 + 61_000)
    await checkRateLimit('k', { limit: 5, windowSec: 60 })

    const [first, second] = pipeline.incr.mock.calls.map((call) => call[0])
    expect(first).not.toBe(second)
  })

  it('fails open when Redis errors', async () => {
    const { getRedisClient, checkRateLimit } = await load()
    const { client } = fakeRedis(async () => {
      throw new Error('ECONNRESET')
    })
    getRedisClient.mockReturnValue(client as never)

    const result = await checkRateLimit('k', { limit: 1, windowSec: 60 })

    expect(result.allowed).toBe(true)
  })

  it('fails open when Redis hangs past the deadline', async () => {
    jest.useFakeTimers()
    try {
      const { getRedisClient, checkRateLimit } = await load()
      const { client } = fakeRedis(() => new Promise(() => {}))
      getRedisClient.mockReturnValue(client as never)

      const pending = checkRateLimit('k', { limit: 1, windowSec: 60 })
      await jest.advanceTimersByTimeAsync(5_000)

      await expect(pending).resolves.toMatchObject({ allowed: true })
    } finally {
      jest.useRealTimers()
    }
  })

  it('falls back to the per-instance limiter when Redis is not configured', async () => {
    const { getRedisClient, checkRateLimit } = await load()
    getRedisClient.mockReturnValue(null)

    const first = await checkRateLimit('unconfigured-key', { limit: 1, windowSec: 60 })
    const second = await checkRateLimit('unconfigured-key', { limit: 1, windowSec: 60 })

    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(false)
  })
})

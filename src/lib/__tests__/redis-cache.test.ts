import { getCachedOrFetch, invalidateCache, generateCacheKey, CACHE_TTL, getRedisClient, resetRedisClient } from '@/lib/redis-cache'

describe('Redis Cache', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.mockRedis.scan.mockReset()
    resetRedisClient()
  })

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_URL
    delete process.env.UPSTASH_REDIS_TOKEN
  })

  describe('getRedisClient', () => {
    it('returns null when env vars are not set', () => {
      const client = getRedisClient()
      expect(client).toBeNull()
    })

    it('returns Redis instance when env vars are set', () => {
      process.env.UPSTASH_REDIS_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_TOKEN = 'test-token'

      const client = getRedisClient()
      expect(client).not.toBeNull()
    })

    it('reuses the same Redis instance', () => {
      process.env.UPSTASH_REDIS_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_TOKEN = 'test-token'

      const client1 = getRedisClient()
      const client2 = getRedisClient()
      expect(client1).toBe(client2)
    })
  })

  describe('generateCacheKey', () => {
    it('generates cache key with type and identifier', () => {
      const key = generateCacheKey('tenant', 'test-slug')
      expect(key).toBe('tenant:test-slug')
    })
  })

  describe('getCachedOrFetch', () => {
    it('returns cached data when available', async () => {
      process.env.UPSTASH_REDIS_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_TOKEN = 'test-token'

      const mockData = { id: '1', name: 'Test Tenant' }
      global.mockRedis.get.mockResolvedValue(mockData)

      const fetcher = jest.fn().mockResolvedValue(mockData)
      const result = await getCachedOrFetch('cache:test', fetcher, 300)

      expect(result).toEqual(mockData)
      expect(global.mockRedis.get).toHaveBeenCalledWith('cache:test')
      expect(fetcher).not.toHaveBeenCalled()
    })

    it('fetches and caches data when not available', async () => {
      process.env.UPSTASH_REDIS_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_TOKEN = 'test-token'

      const mockData = { id: '1', name: 'Test Tenant' }
      global.mockRedis.get.mockResolvedValue(null)
      global.mockRedis.set.mockResolvedValue('OK')

      const fetcher = jest.fn().mockResolvedValue(mockData)
      const result = await getCachedOrFetch('cache:test', fetcher, 300)

      expect(result).toEqual(mockData)
      expect(fetcher).toHaveBeenCalled()
      expect(global.mockRedis.set).toHaveBeenCalledWith('cache:test', mockData, { ex: 300 })
    })

    it('returns fetcher result when Redis is not available', async () => {
      const mockData = { id: '1', name: 'Test Tenant' }
      const fetcher = jest.fn().mockResolvedValue(mockData)
      const result = await getCachedOrFetch('cache:test', fetcher, 300)

      expect(result).toEqual(mockData)
      expect(fetcher).toHaveBeenCalled()
    })

    it('handles Redis get error gracefully', async () => {
      process.env.UPSTASH_REDIS_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_TOKEN = 'test-token'

      const mockData = { id: '1', name: 'Test Tenant' }
      global.mockRedis.get.mockRejectedValue(new Error('Redis error'))
      global.mockRedis.set.mockResolvedValue('OK')

      const fetcher = jest.fn().mockResolvedValue(mockData)
      const result = await getCachedOrFetch('cache:test', fetcher, 300)

      expect(result).toEqual(mockData)
      expect(fetcher).toHaveBeenCalled()
      expect(global.mockRedis.set).toHaveBeenCalledWith('cache:test', mockData, { ex: 300 })
    })

    it('handles Redis set error gracefully', async () => {
      process.env.UPSTASH_REDIS_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_TOKEN = 'test-token'

      const mockData = { id: '1', name: 'Test Tenant' }
      global.mockRedis.get.mockResolvedValue(null)
      global.mockRedis.set.mockRejectedValue(new Error('Redis set error'))

      const fetcher = jest.fn().mockResolvedValue(mockData)
      const result = await getCachedOrFetch('cache:test', fetcher, 300)

      expect(result).toEqual(mockData)
      expect(fetcher).toHaveBeenCalled()
    })
  })

  describe('invalidateCache', () => {
    it('walks wildcard matches across cursor pages, including empty pages', async () => {
      process.env.UPSTASH_REDIS_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_TOKEN = 'test-token'
      global.mockRedis.scan
        .mockResolvedValueOnce(['17', ['cache:test1']])
        .mockResolvedValueOnce(['23', []])
        .mockResolvedValueOnce(['0', ['cache:test2']])

      await invalidateCache('cache:test*')

      expect(global.mockRedis.scan).toHaveBeenNthCalledWith(1, '0', { match: 'cache:test*', count: 100 })
      expect(global.mockRedis.scan).toHaveBeenNthCalledWith(2, '17', { match: 'cache:test*', count: 100 })
      expect(global.mockRedis.scan).toHaveBeenNthCalledWith(3, '23', { match: 'cache:test*', count: 100 })
      expect(global.mockRedis.del.mock.calls).toEqual([['cache:test1'], ['cache:test2']])
      expect(global.mockRedis.keys).not.toHaveBeenCalled()
    })

    it('deletes an exact tenant key without scanning the shared keyspace', async () => {
      process.env.UPSTASH_REDIS_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_TOKEN = 'test-token'

      await invalidateCache('tenant:restaurant-a')

      expect(global.mockRedis.del).toHaveBeenCalledWith('tenant:restaurant-a')
      expect(global.mockRedis.keys).not.toHaveBeenCalled()
      expect(global.mockRedis.scan).not.toHaveBeenCalled()
    })

    it('bounds deletion batches even when SCAN returns more than its count hint', async () => {
      process.env.UPSTASH_REDIS_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_TOKEN = 'test-token'
      const keys = Array.from({ length: 205 }, (_, index) => `cache:test${index}`)
      global.mockRedis.scan.mockResolvedValue(['0', keys])

      await invalidateCache('cache:test*')

      expect(global.mockRedis.del.mock.calls.map(call => call.length)).toEqual([100, 100, 5])
      expect(global.mockRedis.del.mock.calls.flat()).toEqual(keys)
    })

    it.each(['cache:test?', 'cache:test[12]', 'cache:test\\*'])('preserves Redis pattern semantics for %s', async (pattern) => {
      process.env.UPSTASH_REDIS_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_TOKEN = 'test-token'
      global.mockRedis.scan.mockResolvedValue(['0', ['cache:test1']])

      await invalidateCache(pattern)

      expect(global.mockRedis.scan).toHaveBeenCalledWith('0', { match: pattern, count: 100 })
      expect(global.mockRedis.del).toHaveBeenCalledWith('cache:test1')
    })

    it('does not fail a save when exact-key deletion fails', async () => {
      process.env.UPSTASH_REDIS_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_TOKEN = 'test-token'
      global.mockRedis.del.mockRejectedValueOnce(new Error('Redis unavailable'))

      await expect(invalidateCache('tenant:restaurant-a')).resolves.toBeUndefined()
    })

    it('deletes keys matching pattern', async () => {
      process.env.UPSTASH_REDIS_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_TOKEN = 'test-token'

      global.mockRedis.scan.mockResolvedValue(['0', ['cache:test1', 'cache:test2']])
      global.mockRedis.del.mockResolvedValue(2)

      await invalidateCache('cache:test*')

      expect(global.mockRedis.scan).toHaveBeenCalledWith('0', { match: 'cache:test*', count: 100 })
      expect(global.mockRedis.del).toHaveBeenCalledWith('cache:test1', 'cache:test2')
    })

    it('handles pattern with no matching keys', async () => {
      process.env.UPSTASH_REDIS_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_TOKEN = 'test-token'

      global.mockRedis.scan.mockResolvedValue(['0', []])

      await invalidateCache('cache:test*')

      expect(global.mockRedis.del).not.toHaveBeenCalled()
    })

    it('returns gracefully when Redis is not available', async () => {
      await expect(invalidateCache('cache:test*')).resolves.not.toThrow()
    })

    it('handles Redis error gracefully', async () => {
      process.env.UPSTASH_REDIS_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_TOKEN = 'test-token'

      global.mockRedis.scan.mockRejectedValue(new Error('Redis error'))

      await expect(invalidateCache('cache:test*')).resolves.not.toThrow()
    })
  })

  describe('CACHE_TTL', () => {
    it('has correct TTL values', () => {
      expect(CACHE_TTL.TENANT).toBe(1800)
      expect(CACHE_TTL.CATEGORIES).toBe(600)
      expect(CACHE_TTL.MENU_ITEMS).toBe(300)
    })
  })
})

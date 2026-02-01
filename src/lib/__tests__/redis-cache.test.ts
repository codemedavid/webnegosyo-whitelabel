import { getCachedOrFetch, invalidateCache, generateCacheKey, CACHE_TTL, getRedisClient, resetRedisClient } from '@/lib/redis-cache'

describe('Redis Cache', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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
    it('deletes keys matching pattern', async () => {
      process.env.UPSTASH_REDIS_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_TOKEN = 'test-token'

      global.mockRedis.keys.mockResolvedValue(['cache:test1', 'cache:test2'])
      global.mockRedis.del.mockResolvedValue(2)

      await invalidateCache('cache:test*')

      expect(global.mockRedis.keys).toHaveBeenCalledWith('cache:test*')
      expect(global.mockRedis.del).toHaveBeenCalledWith('cache:test1', 'cache:test2')
    })

    it('handles pattern with no matching keys', async () => {
      process.env.UPSTASH_REDIS_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_TOKEN = 'test-token'

      global.mockRedis.keys.mockResolvedValue([])

      await invalidateCache('cache:test*')

      expect(global.mockRedis.del).not.toHaveBeenCalled()
    })

    it('returns gracefully when Redis is not available', async () => {
      await expect(invalidateCache('cache:test*')).resolves.not.toThrow()
    })

    it('handles Redis error gracefully', async () => {
      process.env.UPSTASH_REDIS_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_TOKEN = 'test-token'

      global.mockRedis.keys.mockRejectedValue(new Error('Redis error'))

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

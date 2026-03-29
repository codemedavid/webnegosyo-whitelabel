import { Redis } from '@upstash/redis'

let redisInstance: Redis | null = null

export function resetRedisClient(): void {
  redisInstance = null
}

function getRedisClient(): Redis | null {
  const UPSTASH_REDIS_URL = process.env.UPSTASH_REDIS_URL
  const UPSTASH_REDIS_TOKEN = process.env.UPSTASH_REDIS_TOKEN

  if (!UPSTASH_REDIS_URL || !UPSTASH_REDIS_TOKEN) {
    return null
  }

  if (!redisInstance) {
    redisInstance = new Redis({
      url: UPSTASH_REDIS_URL,
      token: UPSTASH_REDIS_TOKEN,
    })
  }

  return redisInstance
}

export const CACHE_TTL = {
  TENANT: 1800,
  CATEGORIES: 600,
  MENU_ITEMS: 300,
  UPSELL_PAIRS: 300,   // 5 min — complementary pairs, upgrade upsells
  BUNDLES: 300,         // 5 min — menu/upsell bundles
  CHECKOUT_UPSELL: 300, // 5 min — manual picks, star items
} as const

type CacheFetcher<T> = () => Promise<T>

export async function getCachedOrFetch<T>(
  key: string,
  fetcher: CacheFetcher<T>,
  ttl: number = CACHE_TTL.MENU_ITEMS
): Promise<T> {
  const redis = getRedisClient()

  if (!redis) {
    return fetcher()
  }

  try {
    const cached = await redis.get<T>(key)
    if (cached !== null) {
      return cached
    }
  } catch (error) {
    console.error('Redis cache get error:', error)
  }

  const data = await fetcher()

  try {
    await redis.set(key, data, { ex: ttl })
  } catch (error) {
    console.error('Redis cache set error:', error)
  }

  return data
}

export async function invalidateCache(pattern: string): Promise<void> {
  const redis = getRedisClient()

  if (!redis) {
    return
  }

  try {
    const keys = await redis.keys(pattern)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  } catch (error) {
    console.error('Redis cache invalidate error:', error)
  }
}

export function generateCacheKey(type: string, identifier: string): string {
  return `${type}:${identifier}`
}

export { getRedisClient }

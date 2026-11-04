import 'server-only'

import { getRedisClient } from '@/lib/redis-cache'
import type { ReportChunkCache } from './report-rpc'

/** A cache must never make a report slower than reading the month again. */
const REDIS_DEADLINE_MS = 800

function withDeadline<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('report cache timed out')), REDIS_DEADLINE_MS)),
  ])
}

/**
 * Finished months of long reports, in Upstash (`report-rpc.ts` decides what
 * is cached and under which caller). Null when Redis is not configured: long
 * reports then simply read every month.
 */
export function redisReportChunkCache(): ReportChunkCache | null {
  const redis = getRedisClient()
  if (!redis) return null
  return {
    get: (key) => withDeadline(redis.get(key)),
    set: async (key, value, ttlSeconds) => {
      await withDeadline(redis.set(key, value, { ex: ttlSeconds }))
    },
  }
}

import { getRedisClient } from '@/lib/redis-cache'
import { checkRateLimit as checkInstanceRateLimit } from '@/lib/rate-limit'

/**
 * Fixed-window rate limiter shared across serverless instances (Upstash Redis).
 *
 * `rate-limit.ts` counts in a Map inside one lambda, so on Vercel each cold
 * instance starts from zero and a scripted caller is effectively unlimited.
 * This limiter counts in Redis: one INCR per request against a key scoped to
 * the current window, with an EXPIRE so the key disappears with its window.
 *
 * FAILS OPEN by default. Most limits here guard a revenue path (checkout,
 * delivery quotes, payment proofs), so a Redis error or a slow Redis ALLOWS the
 * request. A limit that guards DISCLOSURE instead (a lookup keyed on someone
 * else's identifier) passes `onRedisFailure: 'instance'`, so an outage degrades
 * to the per-instance limiter rather than to no limit at all.
 *
 * When Redis is not configured at all (local dev, a preview without the
 * Upstash vars) it degrades to the per-instance limiter — the protection the
 * app had before this module existed, never less.
 */

export interface RateLimitOptions {
  /** Requests allowed per window. */
  limit: number
  /** Window length in seconds. */
  windowSec: number
  /**
   * What a Redis error, timeout or garbled reply does. `'open'` (default)
   * allows the request; `'instance'` counts it in the per-instance limiter.
   */
  onRedisFailure?: RedisFailureMode
}

export type RedisFailureMode = 'open' | 'instance'

export interface DistributedRateLimitResult {
  allowed: boolean
  remaining: number
  /** Seconds until the current window resets (for a Retry-After header). */
  retryAfterSec: number
}

/** A rate limiter must never make a request noticeably slower than Redis is. */
const REDIS_DEADLINE_MS = 1_000

const KEY_PREFIX = 'rl'

function secondsLeftInWindow(nowMs: number, windowSec: number): number {
  const windowMs = windowSec * 1000
  return Math.max(1, Math.ceil((windowMs - (nowMs % windowMs)) / 1000))
}

function checkInstance(key: string, options: RateLimitOptions, nowMs: number): DistributedRateLimitResult {
  const local = checkInstanceRateLimit(key, {
    maxRequests: options.limit,
    windowMs: options.windowSec * 1000,
  })
  return {
    allowed: local.allowed,
    remaining: local.remaining,
    retryAfterSec: Math.max(1, Math.ceil((local.resetTime - nowMs) / 1000)),
  }
}

/** The answer when Redis could not give one, per the caller's failure mode. */
function onRedisFailure(key: string, options: RateLimitOptions, nowMs: number): DistributedRateLimitResult {
  if (options.onRedisFailure === 'instance') return checkInstance(key, options, nowMs)
  return {
    allowed: true,
    remaining: options.limit,
    retryAfterSec: secondsLeftInWindow(nowMs, options.windowSec),
  }
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`redis deadline ${ms}ms exceeded`)), ms)
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

/**
 * Count one request against `key` and report whether it is within `limit` for
 * the current `windowSec` window. Never throws.
 */
export async function checkRateLimit(
  key: string,
  options: RateLimitOptions,
): Promise<DistributedRateLimitResult> {
  const nowMs = Date.now()
  const retryAfterSec = secondsLeftInWindow(nowMs, options.windowSec)

  const redis = getRedisClient()
  if (!redis) return checkInstance(key, options, nowMs)

  const windowIndex = Math.floor(nowMs / (options.windowSec * 1000))
  const redisKey = `${KEY_PREFIX}:${key}:${windowIndex}`

  try {
    const [count] = await withDeadline(
      redis.pipeline().incr(redisKey).expire(redisKey, options.windowSec + 1).exec<[number, number]>(),
      REDIS_DEADLINE_MS,
    )
    const used = Number(count)
    if (!Number.isFinite(used)) return onRedisFailure(key, options, nowMs)

    return {
      allowed: used <= options.limit,
      remaining: Math.max(0, options.limit - used),
      retryAfterSec,
    }
  } catch (error) {
    const fallback = options.onRedisFailure === 'instance' ? 'per-instance limit' : 'allowing request'
    console.error(`[rate-limit] Redis unavailable; ${fallback}`, {
      key,
      error: error instanceof Error ? error.message : String(error),
    })
    return onRedisFailure(key, options, nowMs)
  }
}

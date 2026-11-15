/**
 * Meta re-sends a webhook it thinks we missed ("immediately… a few more
 * times"), so each event is answered once: Redis SET NX on its key for a day.
 *
 * Fails OPEN: without Redis the event is processed. A rare double reply is
 * better than a customer who never hears back.
 */

import 'server-only'
import crypto from 'crypto'
import { getRedisClient } from '@/lib/redis-cache'
import { createLocalClaims } from './local-claims'

const SEEN_TTL_SECONDS = 24 * 60 * 60

const eventKey = (pageId: string, dedupeKey: string): string =>
  `msgr:evt:${crypto.createHash('sha256').update(`${pageId}:${dedupeKey}`).digest('base64url')}`

export async function claimEventOnce(pageId: string, dedupeKey: string): Promise<boolean> {
  const redis = getRedisClient()
  if (!redis) return true
  try {
    const result = await redis.set(eventKey(pageId, dedupeKey), '1', { nx: true, ex: SEEN_TTL_SECONDS })
    return result === 'OK'
  } catch (error) {
    console.error('[Messenger] dedupe unavailable, processing anyway:', error instanceof Error ? error.message : error)
    return true
  }
}

/** Give a claim back: the work it guarded did not happen (a send Meta refused), so a retry may run. Best effort. */
export async function releaseEventClaim(pageId: string, dedupeKey: string): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return
  try {
    await redis.del(eventKey(pageId, dedupeKey))
  } catch (error) {
    console.error('[Messenger] dedupe release failed:', error instanceof Error ? error.message : error)
  }
}

export interface OnceClaims {
  /** True = this caller may do the work now. */
  claim(key: string): Promise<boolean>
  /** The work did not happen: let a retry claim it again. */
  release(key: string): Promise<void>
}

/**
 * A once-only claim for work a person or a timer can repeat (a staff Send tap,
 * a chat alert push): held in THIS instance first (`local-claims.ts`), then in
 * Redis for the other instances. Redis fails open like `claimEventOnce`, so
 * the instance layer is what stops a repeat on a server without Redis.
 */
export function createOnceClaims(scope: string, ttlSeconds: number): OnceClaims {
  const local = createLocalClaims(ttlSeconds * 1000)
  const redisKey = (key: string) => `msgr:${scope}:${crypto.createHash('sha256').update(key).digest('base64url')}`
  return {
    async claim(key) {
      if (!local.claim(key)) return false
      const redis = getRedisClient()
      if (!redis) return true
      try {
        // Another instance already took it: this one's local claim stays (same work either way).
        return (await redis.set(redisKey(key), '1', { nx: true, ex: ttlSeconds })) === 'OK'
      } catch (error) {
        console.error(`[Messenger] ${scope} claim unavailable, going ahead:`, error instanceof Error ? error.message : error)
        return true
      }
    },
    async release(key) {
      local.release(key)
      const redis = getRedisClient()
      if (!redis) return
      try {
        await redis.del(redisKey(key))
      } catch (error) {
        console.error(`[Messenger] ${scope} claim release failed:`, error instanceof Error ? error.message : error)
      }
    },
  }
}

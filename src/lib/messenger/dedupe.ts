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

const SEEN_TTL_SECONDS = 24 * 60 * 60

export async function claimEventOnce(pageId: string, dedupeKey: string): Promise<boolean> {
  const redis = getRedisClient()
  if (!redis) return true
  const digest = crypto.createHash('sha256').update(`${pageId}:${dedupeKey}`).digest('base64url')
  try {
    const result = await redis.set(`msgr:evt:${digest}`, '1', { nx: true, ex: SEEN_TTL_SECONDS })
    return result === 'OK'
  } catch (error) {
    console.error('[Messenger] dedupe unavailable, processing anyway:', error instanceof Error ? error.message : error)
    return true
  }
}

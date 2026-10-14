/**
 * The shared brakes on expensive Texts requests, one definition for the web's
 * Server Actions (`app/actions/texts.ts`) and the app's bearer route
 * (`POST /api/sms/automations`). Counted in Upstash, so they hold across
 * serverless instances and across the web and the app. Server-only.
 *
 *   preview — a request that reads a whole store's guests; an outage lets it
 *             through (logged by the limiter).
 *   write   — "Write it for me", a paid model call: per person per minute AND
 *             per store per day, refused while the limiter is down.
 */

import 'server-only'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'

export type Meter = 'preview' | 'write'

const PREVIEW_LIMIT: RateLimitOptions = { limit: 30, windowSec: 60, onRedisFailure: 'open' }
const WRITE_LIMIT: RateLimitOptions = { limit: 6, windowSec: 60, onRedisFailure: 'refuse' }
/** "Write it for me" calls per store per (UTC) day — the cost ceiling. */
export const WRITE_DAILY_STORE_LIMIT = 60
const WRITE_DAY_LIMIT: RateLimitOptions = { limit: WRITE_DAILY_STORE_LIMIT, windowSec: 86_400, onRedisFailure: 'refuse' }

const PREVIEW_BUSY = 'Too many previews. Wait a minute and try again.'
const WRITE_BUSY = 'That’s a lot of drafts — wait a minute and try again.'
const WRITE_DAILY_BUSY = 'Write it for me has been used a lot today. Try again tomorrow, or write your own.'

/** Automation requests that read a whole store (metered like a preview). */
const HEAVY_AUTOMATION_ACTIONS: ReadonlySet<string> = new Set(['preview', 'run_now', 'set_status'])

/** Which meter an automations-API action counts against, or null. */
export function automationMeter(action: string): Meter | null {
  if (action === 'write') return 'write'
  return HEAVY_AUTOMATION_ACTIONS.has(action) ? 'preview' : null
}

/** The refusal for an over-limit call, or null when it may run. */
export async function meterError(meter: Meter, tenantId: string, userId: string): Promise<string | null> {
  if (meter === 'preview') {
    return (await checkRateLimit(`texts-preview:${userId}`, PREVIEW_LIMIT)).allowed ? null : PREVIEW_BUSY
  }
  if (!(await checkRateLimit(`texts-write:${userId}`, WRITE_LIMIT)).allowed) return WRITE_BUSY
  return (await checkRateLimit(`texts-write-day:${tenantId}`, WRITE_DAY_LIMIT)).allowed ? null : WRITE_DAILY_BUSY
}

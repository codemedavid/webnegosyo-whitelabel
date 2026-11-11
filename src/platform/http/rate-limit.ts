/**
 * The declared limit, counted by the limiter the app already runs
 * (`distributed-rate-limit.ts`: Redis fixed window, shared across instances).
 *
 * The key is `<bucket>:<subject>`, the shape the hand-written limits use
 * (`receipt-reprinted:<user id>`), so moving a route here keeps its counter.
 */

import { checkActionRateLimit } from '@/lib/action-rate-limit'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'
import type { RateSubject } from './access'
import { windowSeconds, type RateLimitDeclaration, type RateLimitRule } from './entry'

export interface RateVerdict {
  allowed: boolean
  retryAfterSec: number
}

const ALLOWED: RateVerdict = { allowed: true, retryAfterSec: 0 }

function limiterOptions(rule: RateLimitRule): RateLimitOptions {
  return { limit: rule.max, windowSec: windowSeconds(rule.window), onRedisFailure: rule.onRedisFailure }
}

/** The subject of a per-person or per-store rule; null when the access check gave none. */
function subjectKey(rule: RateLimitRule, subject: RateSubject): string | null {
  if (rule.per === 'user') return subject.userId ?? null
  if (rule.per === 'store') return subject.tenant ?? null
  return null
}

/** Count one request. `subject` is empty before the caller is known (public and secret kinds). */
export async function countRouteRequest(
  declared: RateLimitDeclaration | undefined,
  request: Request,
  subject: RateSubject,
): Promise<RateVerdict> {
  if (!declared || declared.per === 'none') return ALLOWED
  // An address nobody could read shares one bucket, as the hand-written routes do.
  const key = declared.per === 'ip' ? getClientIP(request) ?? 'unknown' : subjectKey(declared, subject)
  // A per-person rule with no person is a wiring fault: refuse rather than not count.
  if (key === null) return { allowed: false, retryAfterSec: windowSeconds(declared.window) }
  const verdict = await checkRateLimit(`${declared.bucket}:${key}`, limiterOptions(declared))
  return { allowed: verdict.allowed, retryAfterSec: verdict.retryAfterSec }
}

/** The same for a server action, whose client address comes from `next/headers`. */
export async function countActionCall(
  declared: RateLimitDeclaration | undefined,
  subject: RateSubject,
): Promise<RateVerdict> {
  if (!declared || declared.per === 'none') return ALLOWED
  // `checkActionRateLimit` allows an unreadable address: refusing it would block every proxy that strips headers.
  if (declared.per === 'ip') return checkActionRateLimit(declared.bucket, limiterOptions(declared))
  const key = subjectKey(declared, subject)
  if (key === null) return { allowed: false, retryAfterSec: windowSeconds(declared.window) }
  const verdict = await checkRateLimit(`${declared.bucket}:${key}`, limiterOptions(declared))
  return { allowed: verdict.allowed, retryAfterSec: verdict.retryAfterSec }
}

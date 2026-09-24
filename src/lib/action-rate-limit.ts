import { headers } from 'next/headers'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { getClientIpFromHeaders } from '@/lib/rate-limit'

/**
 * Rate limiting for server actions. An action has no Request, so the client IP
 * is read from `next/headers` (Vercel overwrites x-forwarded-for / x-real-ip
 * with the real client address, so a caller cannot spoof them there).
 *
 * Plain module, NOT 'use server': it is imported by actions, never called from
 * the browser, and a 'use server' file could not export the constants below.
 */

export interface ActionRateLimitResult {
  allowed: boolean
  retryAfterSec: number
}

/**
 * Anonymous checkout orders per tenant per client IP. Generous on purpose: a
 * whole dine-in floor can share one restaurant Wi-Fi IP, and Philippine mobile
 * carriers put many phones behind one CGNAT address.
 */
export const ORDER_RATE_LIMIT: RateLimitOptions = { limit: 20, windowSec: 60 }

/** The calling client's IP, or null outside a request / behind no proxy. */
export async function getActionClientIp(): Promise<string | null> {
  try {
    return getClientIpFromHeaders(await headers())
  } catch {
    return null
  }
}

/**
 * Count one call of `scope` from the current client. An unknown IP is allowed:
 * refusing it would block every customer behind a proxy that strips headers.
 */
export async function checkActionRateLimit(
  scope: string,
  options: RateLimitOptions,
): Promise<ActionRateLimitResult> {
  const ip = await getActionClientIp()
  if (!ip) return { allowed: true, retryAfterSec: 0 }

  const result = await checkRateLimit(`${scope}:${ip}`, options)
  return { allowed: result.allowed, retryAfterSec: result.retryAfterSec }
}

/** Ready-made guard for `createOrderAction`: orders per tenant per client IP. */
export function checkOrderRateLimit(tenantId: string): Promise<ActionRateLimitResult> {
  return checkActionRateLimit(`order:${tenantId}`, ORDER_RATE_LIMIT)
}

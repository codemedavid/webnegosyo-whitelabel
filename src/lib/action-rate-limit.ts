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

/**
 * Where the call came from: a client address, a request whose address could
 * not be read, or no request at all (`headers()` throws outside one).
 */
type CallOrigin = { kind: 'address'; ip: string } | { kind: 'unknown-address' } | { kind: 'no-request' }

async function readCallOrigin(): Promise<CallOrigin> {
  let reader: Awaited<ReturnType<typeof headers>>
  try {
    reader = await headers()
  } catch {
    return { kind: 'no-request' }
  }
  const ip = getClientIpFromHeaders(reader)
  return ip ? { kind: 'address', ip } : { kind: 'unknown-address' }
}

/** The calling client's IP, or null outside a request / behind no proxy. */
export async function getActionClientIp(): Promise<string | null> {
  const origin = await readCallOrigin()
  return origin.kind === 'address' ? origin.ip : null
}

/**
 * Count one call of `scope` from the current client.
 *
 * - A readable address has its own bucket: `<scope>:<ip>`.
 * - A request with NO readable address shares one bucket, `<scope>:unknown`,
 *   as the route limits do (`platform/http/rate-limit.ts`). Letting it through
 *   uncounted made "send no address" a way past every action limit. On Vercel
 *   every request carries one (Vercel sets `x-vercel-forwarded-for` itself), so
 *   a real customer never lands in the shared bucket.
 * - No request at all (server code calling the action, `headers()` throws)
 *   has no client to count, and is allowed.
 */
export async function checkActionRateLimit(
  scope: string,
  options: RateLimitOptions,
): Promise<ActionRateLimitResult> {
  const origin = await readCallOrigin()
  if (origin.kind === 'no-request') return { allowed: true, retryAfterSec: 0 }

  const subject = origin.kind === 'address' ? origin.ip : 'unknown'
  const result = await checkRateLimit(`${scope}:${subject}`, options)
  return { allowed: result.allowed, retryAfterSec: result.retryAfterSec }
}

/** Ready-made guard for `createOrderAction`: orders per tenant per client IP. */
export function checkOrderRateLimit(tenantId: string): Promise<ActionRateLimitResult> {
  return checkActionRateLimit(`order:${tenantId}`, ORDER_RATE_LIMIT)
}

import { NextResponse } from 'next/server'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'

/**
 * Per-IP guard for a route handler: a 429 once `scope` is over its limit for
 * this client, else null. An unknown IP is let through (refusing it would block
 * everyone behind a proxy that strips the headers) and so is a Redis outage,
 * unless `options.onRedisFailure` says otherwise.
 */
export async function refuseOverIpLimit(
  request: Request,
  scope: string,
  options: RateLimitOptions,
): Promise<NextResponse | null> {
  const ip = getClientIP(request)
  if (!ip) return null

  const result = await checkRateLimit(`${scope}:${ip}`, options)
  if (result.allowed) return null

  return NextResponse.json(
    { error: 'Too many requests. Please try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfterSec), 'Cache-Control': 'no-store' } },
  )
}

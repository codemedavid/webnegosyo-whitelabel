import { NextResponse } from 'next/server'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'

export interface IpLimitGuardOptions {
  /**
   * What happens to a request whose address nobody could read.
   *
   * `'count'` (the default): every such request shares one bucket
   * (`<scope>:unknown`), so "no address" is never "no limit". Right for a route
   * a browser or a phone calls.
   *
   * `'allow'`: let it through uncounted. Only for a route another SERVER calls
   * (the database through pg_net): one caller makes every request and none is
   * retried, so a refusal there is a notification that is never sent.
   */
  withoutAddress?: 'count' | 'allow'
}

/**
 * Per-IP guard for a route handler: a 429 once `scope` is over its limit for
 * this client, else null. A Redis outage lets the request through unless
 * `options.onRedisFailure` says otherwise.
 */
export async function refuseOverIpLimit(
  request: Request,
  scope: string,
  options: RateLimitOptions,
  { withoutAddress = 'count' }: IpLimitGuardOptions = {},
): Promise<NextResponse | null> {
  const ip = getClientIP(request)
  if (!ip && withoutAddress === 'allow') return null

  const result = await checkRateLimit(`${scope}:${ip ?? 'unknown'}`, options)
  if (result.allowed) return null

  return NextResponse.json(
    { error: 'Too many requests. Please try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfterSec), 'Cache-Control': 'no-store' } },
  )
}

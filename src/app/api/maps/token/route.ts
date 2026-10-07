import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { mapKitOriginForRequest } from '@/lib/maps/apple/mapkit-origin'
import { readMapKitConfig, signMapKitToken } from '@/lib/maps/apple/mapkit-token'
import { getClientIP } from '@/lib/rate-limit'
import { domainDirectory } from '@/lib/tenant-domains'

/**
 * GET /api/maps/token
 *
 * MapKit JS's `authorizationCallback`: a fresh JWT for the page asking. It is
 * public (every checkout's address field loads MapKit), so the token is:
 * - bound to the requesting page's origin, which Apple checks against the
 *   browser's Origin header, so a copied token is useless on another site;
 * - only issued for hosts this platform serves (platform roots, verified
 *   custom domains);
 * - short-lived (MapKit calls back for a new one when it expires);
 * - rate limited per IP, because every token spends the team's Apple quota.
 */

const TOKEN_TTL_SECONDS = 30 * 60
const RATE_LIMIT: RateLimitOptions = { limit: 60, windowSec: 60, onRedisFailure: 'instance' }
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = readMapKitConfig()
  if (!config) {
    return NextResponse.json({ error: 'Maps are not configured' }, { status: 503, headers: NO_STORE })
  }

  const ip = getClientIP(request) ?? 'unknown'
  const rate = await checkRateLimit(`maps-token:${ip}`, RATE_LIMIT)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': String(rate.retryAfterSec) } },
    )
  }

  const origin = await mapKitOriginForRequest(request.headers, (host) => domainDirectory.lookup(host))
  if (!origin) {
    return NextResponse.json({ error: 'Unknown host' }, { status: 403, headers: NO_STORE })
  }

  try {
    const token = signMapKitToken(config, { ttlSeconds: TOKEN_TTL_SECONDS, origin })
    return new NextResponse(token, { headers: { ...NO_STORE, 'Content-Type': 'text/plain' } })
  } catch (error) {
    // A malformed key is a deploy problem: log it, never echo it.
    console.error('[maps-token] failed to sign a MapKit token:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Maps are unavailable' }, { status: 503, headers: NO_STORE })
  }
}

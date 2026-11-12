import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { parsePastedLocation } from '@/lib/maps/pasted-location'
import { resolveShortMapLink, type LinkFetch } from '@/lib/maps/resolve-map-link'
import { getClientIP } from '@/lib/rate-limit'

/**
 * POST /api/maps/resolve-link — where a pasted short map link points.
 *
 * Public, because checkout is: a customer pastes the link a friend sent them
 * on Messenger. A browser can't read a cross-site redirect, so the server does,
 * limited to Google's short-link hosts (`resolve-map-link.ts`). Limited per IP,
 * generously, since a whole floor can share one address; fails open like the
 * other checkout limits, because this call costs us nothing but the fetch.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RATE_LIMIT = { limit: 30, windowSec: 60 }
const bodySchema = z.object({ url: z.string().trim().min(1).max(500) })
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Paste a map link.' }, { status: 400, headers: NO_STORE })

  const link = parsePastedLocation(parsed.data.url)
  if (link?.kind !== 'short-link') {
    return NextResponse.json({ error: 'That is not a short map link.' }, { status: 400, headers: NO_STORE })
  }

  // A request with no readable address still counts: they all share one bucket.
  const ip = getClientIP(request) ?? 'unknown'
  const limit = await checkRateLimit(`maps-resolve-link:${ip}`, RATE_LIMIT)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many links. Please wait a moment.' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(limit.retryAfterSec) } })
  }

  try {
    const location = await resolveShortMapLink(link.url, fetch as unknown as LinkFetch)
    return NextResponse.json({ location }, { headers: NO_STORE })
  } catch (error) {
    console.error('[maps-resolve-link] lookup failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ location: null }, { headers: NO_STORE })
  }
}

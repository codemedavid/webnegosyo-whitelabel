import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getPhoneLoyaltyProgress } from '@/lib/loyalty/progress-lookup'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

/**
 * POST /api/loyalty/progress
 *
 * "How many stamps do I have?", for the two customer surfaces that have no
 * order to authorize with: the checkout form and the receipt claim form.
 *
 * The number is the only credential there is, so the boundary is drawn tightly
 * instead: POST (a number must not end up in a URL, a log line or a referrer),
 * a reply that carries a balance and a reward label and nothing that names
 * anybody, and a per-IP limit well below the ordinary read allowance because
 * every call asks about an identifier the caller may not own.
 */

const bodySchema = z
  .object({
    tenantId: z.string().uuid(),
    phone: z.string().min(1).max(32),
    outletId: z.string().uuid().nullish(),
  })
  .strict()

const RATE_LIMIT = { maxRequests: 10, windowMs: 60000 }

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIP(request) ?? 'unknown'
  if (!checkRateLimit(`loyalty-progress:${ip}`, RATE_LIMIT).allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const raw = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const result = await getPhoneLoyaltyProgress({
    tenantId: parsed.data.tenantId,
    phone: parsed.data.phone,
    outletId: parsed.data.outletId ?? null,
  })

  if (result.ok) {
    return NextResponse.json(
      { success: true, ...result.progress },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  return NextResponse.json(
    { error: result.error },
    { status: result.error === 'invalid_phone' ? 400 : 503 },
  )
}

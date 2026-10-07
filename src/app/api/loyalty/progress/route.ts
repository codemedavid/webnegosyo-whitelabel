import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getPhoneLoyaltyProgress } from '@/lib/loyalty/progress-lookup'
import { toPublicProgressResponse } from '@/lib/loyalty/progress-response'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { readWalletOtpRequired, type StoreSettingsClient } from '@/lib/loyalty/store-settings'

/**
 * POST /api/loyalty/progress
 *
 * "How many stamps do I have?", for the two customer surfaces that have no
 * order to authorize with: the checkout form and the receipt claim form.
 *
 * The number is the only credential there is, so the boundary is drawn tightly
 * instead: POST (a number must not end up in a URL, a log line or a referrer),
 * a reply that carries only what the stamp panel paints (an allow-listed card:
 * no name, no id, no number, not even the store-wide offer), and a per-IP limit
 * well below the ordinary read allowance because every call asks about an
 * identifier the caller may not own.
 *
 * The limit is counted in Redis so it holds across serverless instances (an
 * in-memory count restarts with every cold lambda). A Redis outage degrades to
 * the per-instance count — never to no limit — and a refusal only hides the
 * card; checkout itself never calls this route to place an order.
 */

const bodySchema = z
  .object({
    tenantId: z.string().uuid(),
    phone: z.string().min(1).max(32),
    outletId: z.string().uuid().nullish(),
  })
  .strict()

const RATE_LIMIT: RateLimitOptions = { limit: 10, windowSec: 60, onRedisFailure: 'instance' }

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIP(request) ?? 'unknown'
  const rate = await checkRateLimit(`loyalty-progress:${ip}`, RATE_LIMIT)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    )
  }

  const raw = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // A store that makes its rewards page text a code first must not show the
  // same card here to anyone who types a number. Unreadable reads as "on":
  // hiding the panel never blocks checkout.
  if (await requiresVerifiedNumber(parsed.data.tenantId)) {
    return NextResponse.json(toPublicProgressResponse(null), {
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const result = await getPhoneLoyaltyProgress({
    tenantId: parsed.data.tenantId,
    phone: parsed.data.phone,
    outletId: parsed.data.outletId ?? null,
  })

  if (result.ok) {
    return NextResponse.json(toPublicProgressResponse(result.progress.card), {
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  return NextResponse.json(
    { error: result.error },
    { status: result.error === 'invalid_phone' ? 400 : 503 },
  )
}

async function requiresVerifiedNumber(tenantId: string): Promise<boolean> {
  try {
    return await readWalletOtpRequired(createAdminClient() as unknown as StoreSettingsClient, tenantId)
  } catch {
    return true
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'
import { findOnboardingForToken } from '@/lib/onboarding/access'
import { isClientEvent, recordOnboardingEvent } from '@/lib/onboarding/events'

/**
 * /api/onboarding/[token]/events — the set-up's funnel beacon.
 *
 *   POST { event }   record the first time this set-up reached a screen or milestone
 *
 * Only names from a fixed list are accepted; nothing the buyer typed is ever
 * sent. Always answers 204 for a valid link, so a measurement hiccup never
 * shows up in the wizard.
 */
export const dynamic = 'force-dynamic'

const RATE_LIMIT = { limit: 120, windowSec: 600 }
const bodySchema = z.object({ event: z.string().max(60) }).strict()

type RouteContext = { params: Promise<{ token: string }> }

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ip = getClientIP(request)
  if (ip) {
    const rate = await checkRateLimit(`onboarding-events:${ip}`, RATE_LIMIT)
    if (!rate.allowed) return new NextResponse(null, { status: 429 })
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !isClientEvent(parsed.data.event)) return new NextResponse(null, { status: 400 })

  try {
    const { token } = await context.params
    const admin = createAdminClient()
    const onboarding = await findOnboardingForToken(admin, token)
    if (!onboarding) return new NextResponse(null, { status: 404 })
    await recordOnboardingEvent(admin as unknown as SupabaseClient, onboarding.id, parsed.data.event)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.warn('[onboarding/events] beacon failed', error instanceof Error ? error.message : error)
    return new NextResponse(null, { status: 204 })
  }
}

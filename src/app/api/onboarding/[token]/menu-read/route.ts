import { after, NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'
import { findOnboardingForToken } from '@/lib/onboarding/access'
import { MAX_ONBOARDING_MENU_TEXT } from '@/lib/onboarding/answers'
import { requestMenuRead } from '@/lib/onboarding/menu-read-run'

/**
 * /api/onboarding/[token]/menu-read — read the menu while the owner answers.
 *
 *   POST { menuText }   report (and, the first time, start) the read of the
 *                       set-up's uploaded photos + this text. Polled.
 *
 * The token is the only credential. A read only ever looks at the photos the
 * upload route stored and the text sent here; reads per set-up are capped.
 */
export const dynamic = 'force-dynamic'
// The read runs after the response, through a vision model.
export const maxDuration = 300

const NO_STORE = { 'Cache-Control': 'no-store' }
/** Polled every few seconds while the owner answers other questions. */
const READ_RATE_LIMIT = { limit: 120, windowSec: 600 }

const bodySchema = z.object({ menuText: z.string().max(MAX_ONBOARDING_MENU_TEXT).default('') }).strict()

type RouteContext = { params: Promise<{ token: string }> }

function respond(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ip = getClientIP(request)
  if (ip) {
    const rate = await checkRateLimit(`onboarding-menu-read:${ip}`, READ_RATE_LIMIT)
    if (!rate.allowed) return respond({ error: 'Too many requests. Please wait a moment.' }, 429)
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return respond({ error: 'Expected the menu text.' }, 400)

  try {
    const { token } = await context.params
    const admin = createAdminClient()
    const onboarding = await findOnboardingForToken(admin, token)
    if (!onboarding) return respond({ error: 'This set-up link is not valid.' }, 404)
    if (onboarding.status !== 'awaiting_details') return respond({ success: true, read: { status: 'idle', dishes: [] } })

    const { view, run } = await requestMenuRead(admin, onboarding, parsed.data.menuText)
    if (run) after(run)
    return respond({ success: true, read: view })
  } catch (error) {
    console.error('[onboarding/menu-read] request failed', error instanceof Error ? error.message : error)
    return respond({ error: 'Could not read your menu just now.' }, 503)
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'
import { findOnboardingForToken } from '@/lib/onboarding/access'
import { LaunchOfferError, decideLaunchCombo, readLaunchCombos } from '@/lib/onboarding/launch-offers'

/**
 * /api/onboarding/[token]/launch-offers — the reveal's "Keep this combo?" cards.
 *
 *   GET                                  the store's launch combos and their status
 *   POST { proposalId, decision }        keep (approve + put live) or skip one
 *
 * The set-up token is the owner's credential. Only the store's own launch
 * combos are reachable, and only once the build has stopped.
 */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const RATE_LIMIT = { limit: 60, windowSec: 600 }

const decisionSchema = z.object({
  proposalId: z.string().uuid(),
  decision: z.enum(['keep', 'skip']),
}).strict()

type RouteContext = { params: Promise<{ token: string }> }

function respond(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

type Resolved =
  | { ok: false; response: NextResponse }
  | { ok: true; admin: SupabaseClient; tenant: { id: string; slug: string } }

async function resolveStore(request: NextRequest, context: RouteContext): Promise<Resolved> {
  const ip = getClientIP(request)
  if (ip) {
    const rate = await checkRateLimit(`onboarding-launch-offers:${ip}`, RATE_LIMIT)
    if (!rate.allowed) return { ok: false, response: respond({ error: 'Too many requests. Please wait a moment.' }, 429) }
  }
  const { token } = await context.params
  const admin = createAdminClient()
  const onboarding = await findOnboardingForToken(admin, token)
  if (!onboarding) return { ok: false, response: respond({ error: 'This set-up link is not valid.' }, 404) }
  const isBuilt = onboarding.status === 'ready' || onboarding.status === 'failed'
  if (!onboarding.tenantId || !isBuilt) return { ok: false, response: respond({ error: 'Your store is still being built.' }, 409) }
  const { data: tenant } = await admin.from('tenants').select('id, slug').eq('id', onboarding.tenantId).maybeSingle()
  if (!tenant) return { ok: false, response: respond({ error: 'Your store could not be found.' }, 404) }
  return { ok: true, admin: admin as unknown as SupabaseClient, tenant: tenant as { id: string; slug: string } }
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const found = await resolveStore(request, context)
    if (!found.ok) return found.response
    return respond({ success: true, combos: await readLaunchCombos(found.admin, found.tenant.id) })
  } catch (error) {
    console.error('[onboarding/launch-offers] read failed', error instanceof Error ? error.message : error)
    return respond({ error: 'Could not load your combos. Please refresh.' }, 503)
  }
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return respond({ error: 'Pick keep or skip.' }, 400)
  try {
    const found = await resolveStore(request, context)
    if (!found.ok) return found.response
    const outcome = await decideLaunchCombo(found.admin, found.tenant, parsed.data.proposalId, parsed.data.decision)
    return respond({ success: true, outcome, combos: await readLaunchCombos(found.admin, found.tenant.id) })
  } catch (error) {
    if (error instanceof LaunchOfferError) return respond({ error: error.message }, error.status)
    console.error('[onboarding/launch-offers] decision failed', error instanceof Error ? error.message : error)
    return respond({ error: 'That did not save. Please try again.' }, 500)
  }
}

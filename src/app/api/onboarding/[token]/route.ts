import { after, NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'
import { findOnboardingForToken, loadOnboardingView } from '@/lib/onboarding/access'
import { describeAnswersError, onboardingSubmitSchema } from '@/lib/onboarding/answers'
import { provisionStore } from '@/lib/onboarding/provision'
import { runOnboardingBuild } from '@/lib/onboarding/build'
import { isWellFormedOnboardingToken } from '@/lib/onboarding/token'
import { isBuildRetryable, MAX_BUYER_BUILD_ATTEMPTS } from '@/lib/onboarding/build-staleness'
import { isBuyerFacingError } from '@/lib/onboarding/errors'

/**
 * /api/onboarding/[token] — the buyer's store set-up.
 *
 *   GET                         progress view (polled by the progress screen)
 *   POST { answers, ownerPassword }   create the store + owner, then build it
 *   POST { action: 'retry' }          re-run the build steps that failed (or a build that died mid-run)
 *
 * The token in the path is the only credential: a 256-bit secret handed to
 * the buyer after checkout. The build (menu reading, offers, loyalty) runs
 * after the response, so the buyer sees progress instead of a spinner.
 */
export const dynamic = 'force-dynamic'
// Menu photos go through a vision model; give the background build room.
export const maxDuration = 300

const NO_STORE = { 'Cache-Control': 'no-store' }
const SUBMIT_RATE_LIMIT = { limit: 10, windowSec: 600 }

function respond(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

const NOT_FOUND = { error: 'This set-up link is not valid. Ask us for a new one.' }
const SUBMIT_FAILED = 'Your store could not be created. Please try again in a minute.'

type RouteContext = { params: Promise<{ token: string }> }

async function resolve(context: RouteContext) {
  const { token } = await context.params
  if (!isWellFormedOnboardingToken(token)) return null
  const admin = createAdminClient()
  const onboarding = await findOnboardingForToken(admin, token)
  return onboarding ? { admin, onboarding } : null
}

export async function GET(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const found = await resolve(context)
    if (!found) return respond(NOT_FOUND, 404)
    return respond({ success: true, view: await loadOnboardingView(found.admin, found.onboarding) })
  } catch (error) {
    console.error('[onboarding] status read failed', error instanceof Error ? error.message : error)
    return respond({ error: 'Could not load your set-up. Please refresh.' }, 503)
  }
}

function scheduleBuild(onboardingId: string): void {
  after(async () => {
    try {
      await runOnboardingBuild(createAdminClient(), onboardingId)
    } catch (error) {
      console.error('[onboarding] background build failed', { onboardingId, error: error instanceof Error ? error.message : error })
    }
  })
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ip = getClientIP(request)
  if (ip) {
    const rate = await checkRateLimit(`onboarding-submit:${ip}`, SUBMIT_RATE_LIMIT)
    if (!rate.allowed) return respond({ error: 'Too many attempts. Please wait a few minutes.' }, 429)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return respond({ error: 'Expected JSON.' }, 400)
  }

  try {
    const found = await resolve(context)
    if (!found) return respond(NOT_FOUND, 404)
    const { admin, onboarding } = found

    if ((body as { action?: unknown } | null)?.action === 'retry') {
      if (!isBuildRetryable(onboarding)) return respond({ error: 'Nothing to retry.' }, 409)
      if (onboarding.attempts >= MAX_BUYER_BUILD_ATTEMPTS) {
        return respond({ error: 'This set-up needs a hand from our team. Message us and we will finish it for you.' }, 429)
      }
      scheduleBuild(onboarding.id)
      return respond({ success: true })
    }

    if (onboarding.status !== 'awaiting_details') return respond({ error: 'Your store is already being set up.' }, 409)

    const parsed = onboardingSubmitSchema.safeParse(body)
    if (!parsed.success) return respond({ error: describeAnswersError(parsed.error) }, 400)

    const store = await provisionStore(admin, onboarding, parsed.data.answers, parsed.data.ownerPassword)
    scheduleBuild(onboarding.id)
    return respond({ success: true, slug: store.slug })
  } catch (error) {
    console.error('[onboarding] submit failed', error instanceof Error ? error.message : error)
    // Only messages written for the buyer go back; internals stay in the log.
    return respond({ error: isBuyerFacingError(error) ? error.message : SUBMIT_FAILED }, 422)
  }
}

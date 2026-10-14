import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { parseSetPinRequest } from '@/lib/gov-discount-ledger/request-schemas'
import { requireGovCaller } from '@/lib/gov-discount-ledger/route-guards'
import { createLogger } from '@/lib/logger'

/** Shared across instances; a Redis outage falls back to the per-instance limit. */
const BURST: RateLimitOptions = { limit: 10, windowSec: 60, onRedisFailure: 'instance' }
const log = createLogger('[gov-discounts/pin]', 'DEBUG_GOV_DISCOUNTS')

/**
 * POST /api/gov-discounts/pin — the signed-in manager sets their OWN approval
 * PIN from the merchant app. Never anyone else's: the user is the token's,
 * and only someone who reviews discounts (`discount_review`) has a PIN.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const parsed = parseSetPinRequest(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const caller = await requireGovCaller(request, parsed.value.tenantId, 'edit', 'discount_review')
  if (!caller.ok) return caller.response

  if (!(await checkRateLimit(`gov-pin:${parsed.value.tenantId}:${caller.user.id}`, BURST)).allowed) {
    return NextResponse.json({ error: 'Too many tries. Wait a minute and try again.' }, { status: 429 })
  }

  const { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } = await import('@/lib/supabase/admin')
  const { createSupabaseApprovalStore } = await import('@/lib/gov-discount-ledger/supabase-approval-store')
  const { setOwnApprovalPin } = await import('@/lib/gov-discount-ledger/approval-service')

  try {
    const store = createSupabaseApprovalStore(createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS }))
    const outcome = await setOwnApprovalPin(store, parsed.value.tenantId, caller.user.id, parsed.value.pin)
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
    return NextResponse.json({ success: true })
  } catch (error) {
    // Never the raw message: a Postgres error can echo the function's input.
    log.error('failed', { tenantId: parsed.value.tenantId, error: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'Could not save the PIN. Try again.' }, { status: 500 })
  }
}

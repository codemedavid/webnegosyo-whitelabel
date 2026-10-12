import { NextRequest, NextResponse } from 'next/server'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'
import { checkRateLimit } from '@/lib/rate-limit'
import { parseSetPinRequest } from '@/lib/gov-discount-ledger/request-schemas'

const BURST = { maxRequests: 10, windowMs: 60_000 }

/**
 * POST /api/gov-discounts/pin — the signed-in manager sets their OWN approval
 * PIN from the merchant app. Never anyone else's: the user is the token's.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const parsed = parseSetPinRequest(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const caller = await requireBearerStoreCaller(request, parsed.value.tenantId, 'edit')
  if (!caller.ok) return caller.response

  if (!checkRateLimit(`gov-pin:${caller.user.id}`, BURST).allowed) {
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
    console.error('[gov-discounts/pin] failed', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Could not save the PIN. Try again.' }, { status: 500 })
  }
}

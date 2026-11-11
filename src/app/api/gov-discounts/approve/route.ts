import { NextRequest, NextResponse } from 'next/server'
import { parseApproveRequest } from '@/lib/gov-discount-ledger/request-schemas'
import { outletRefusal, requireGovCaller, resolveRouteOutlet } from '@/lib/gov-discount-ledger/route-guards'
import { createLogger } from '@/lib/logger'
import { PIN_TOO_MANY_TRIES, checkPinTryLimits } from '@/lib/staff-pin/pin-limits'

const log = createLogger('[gov-discounts/approve]', 'DEBUG_GOV_DISCOUNTS')

// The PIN rate limits (per cashier, per approver) live in staff-pin/pin-limits.ts,
// shared with every other manager-PIN route.

/**
 * POST /api/gov-discounts/approve
 *
 * A manager typing their PIN on the cashier's register to vouch for a large
 * Senior/PWD discount. Returns a one-time approval id the register attaches
 * to the sale; the sales book consumes it when the grant is recorded.
 *
 * The caller is the CASHIER (their token, holding `pos`); the approver is
 * named in the body and proven by their PIN, which the database checks and
 * locks after five wrong tries (longer each time). Limits per cashier and per
 * approver sit in front of that. The branch is the cashier's own, and the
 * approval is bound to these claimants (`approval-binding.ts`).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const parsed = parseApproveRequest(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { tenantId, approverUserId } = parsed.value
  const caller = await requireGovCaller(request, tenantId, 'create', 'pos')
  if (!caller.ok) return caller.response

  if (!(await checkPinTryLimits(`gov-approve:cashier:${tenantId}:${caller.user.id}`, tenantId, approverUserId))) {
    return NextResponse.json({ error: PIN_TOO_MANY_TRIES }, { status: 429 })
  }

  const { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } = await import('@/lib/supabase/admin')
  const { createSupabaseApprovalStore } = await import('@/lib/gov-discount-ledger/supabase-approval-store')
  const { approveGrant } = await import('@/lib/gov-discount-ledger/approval-service')
  const { resolveLedgerActor } = await import('@/lib/gov-discount-ledger/actor')

  try {
    const db = createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS })
    const outlet = await resolveRouteOutlet(db, caller.appUser, tenantId, parsed.value.outletId)
    if (!outlet.ok) return outletRefusal(outlet)
    const cashier = await resolveLedgerActor(db, tenantId, caller.user)
    const outcome = await approveGrant(
      createSupabaseApprovalStore(db),
      { ...parsed.value, outletId: outlet.outletId },
      cashier,
    )
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
    return NextResponse.json({
      success: true,
      approvalId: outcome.approvalId,
      approverName: outcome.approverName,
      expiresAt: outcome.expiresAt,
    })
  } catch (error) {
    log.error('failed', { tenantId, error: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'Could not check the PIN. Try again.' }, { status: 500 })
  }
}

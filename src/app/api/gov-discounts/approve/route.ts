import { NextRequest, NextResponse } from 'next/server'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'
import { checkRateLimit } from '@/lib/rate-limit'
import { parseApproveRequest } from '@/lib/gov-discount-ledger/request-schemas'

const BURST = { maxRequests: 20, windowMs: 60_000 }

/**
 * POST /api/gov-discounts/approve
 *
 * A manager typing their PIN on the cashier's register to vouch for a large
 * Senior/PWD discount. Returns a one-time approval id the register attaches
 * to the sale; the sales book consumes it when the grant is recorded.
 *
 * The caller is the CASHIER (their token); the approver is named in the body
 * and proven by their PIN, which the database checks and locks after five
 * wrong tries. A burst limit per cashier sits in front of that.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const parsed = parseApproveRequest(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const caller = await requireBearerStoreCaller(request, parsed.value.tenantId, 'create')
  if (!caller.ok) return caller.response

  if (!checkRateLimit(`gov-approve:${caller.user.id}`, BURST).allowed) {
    return NextResponse.json({ error: 'Too many tries. Wait a minute and try again.' }, { status: 429 })
  }

  const { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } = await import('@/lib/supabase/admin')
  const { createSupabaseApprovalStore } = await import('@/lib/gov-discount-ledger/supabase-approval-store')
  const { approveGrant } = await import('@/lib/gov-discount-ledger/approval-service')
  const { resolveLedgerActor } = await import('@/lib/gov-discount-ledger/actor')

  try {
    const db = createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS })
    const cashier = await resolveLedgerActor(db, parsed.value.tenantId, caller.user)
    const outcome = await approveGrant(createSupabaseApprovalStore(db), parsed.value, cashier)
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
    return NextResponse.json({
      success: true,
      approvalId: outcome.approvalId,
      approverName: outcome.approverName,
      expiresAt: outcome.expiresAt,
    })
  } catch (error) {
    console.error('[gov-discounts/approve] failed', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Could not check the PIN. Try again.' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { parseRecordRequest } from '@/lib/gov-discount-ledger/request-schemas'
import { outletRefusal, requireGovCaller, resolveRouteOutlet } from '@/lib/gov-discount-ledger/route-guards'

const REFUSAL_MESSAGES = {
  order_not_found: 'That order is not in this store.',
  order_still_discounted: 'The saved order still has its Senior/PWD discount. It will be retried.',
} as const

/**
 * POST /api/gov-discounts/record
 *
 * The register (or checkout) reporting a Senior/PWD grant for the sales book —
 * after a sale, after an edit, or with `government: null` when an edit or a
 * cancellation took it away. The server re-prices it, flags differences and
 * appends to the ledger; it never refuses a record over a disagreement,
 * because the customer has already paid.
 *
 * The actor comes from the verified token, who must hold `pos`; the branch is
 * the caller's own (a branch account cannot file for another branch). A
 * take-back the saved order contradicts answers 409 (`record-service.ts`).
 * Idempotent: the register retries from its bookkeeping queue until this
 * answers 2xx.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const parsed = parseRecordRequest(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const grant = parsed.value

  const caller = await requireGovCaller(request, grant.tenantId, 'create', 'pos')
  if (!caller.ok) return caller.response

  const { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } = await import('@/lib/supabase/admin')
  const { createSupabaseLedgerStore } = await import('@/lib/gov-discount-ledger/supabase-store')
  const { recordGovDiscount } = await import('@/lib/gov-discount-ledger/record-service')
  const { resolveLedgerActor } = await import('@/lib/gov-discount-ledger/actor')

  try {
    const db = createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS })
    const outlet = await resolveRouteOutlet(db, caller.appUser, grant.tenantId, grant.outletId)
    if (!outlet.ok) return outletRefusal(outlet)
    const actor = await resolveLedgerActor(db, grant.tenantId, caller.user)
    const outcome = await recordGovDiscount(
      createSupabaseLedgerStore(db),
      { ...grant, outletId: outlet.outletId },
      actor,
      new Date(),
    )
    if (outcome.refused) {
      return NextResponse.json({ error: REFUSAL_MESSAGES[outcome.refused], code: outcome.refused }, { status: 409 })
    }
    return NextResponse.json({ success: true, ...outcome })
  } catch (error) {
    console.error('[gov-discounts/record] write failed', {
      tenantId: grant.tenantId,
      externalOrderId: grant.externalOrderId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Could not record the discount. It will be retried.' }, { status: 500 })
  }
}

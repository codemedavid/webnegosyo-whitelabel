import { NextRequest, NextResponse } from 'next/server'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'
import { parseRecordRequest } from '@/lib/gov-discount-ledger/request-schemas'

/**
 * POST /api/gov-discounts/record
 *
 * The register (or checkout) reporting a Senior/PWD grant for the sales book —
 * after a sale, after an edit, or with `government: null` when an edit or a
 * cancellation took it away. The server re-prices it, flags differences and
 * appends to the ledger; it never refuses a record over a disagreement,
 * because the customer has already paid.
 *
 * The actor comes from the verified token. Idempotent: the register retries
 * from its bookkeeping queue until this answers 2xx.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const parsed = parseRecordRequest(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const grant = parsed.value

  const caller = await requireBearerStoreCaller(request, grant.tenantId, 'create')
  if (!caller.ok) return caller.response

  const { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } = await import('@/lib/supabase/admin')
  const { createSupabaseLedgerStore } = await import('@/lib/gov-discount-ledger/supabase-store')
  const { recordGovDiscount } = await import('@/lib/gov-discount-ledger/record-service')
  const { resolveLedgerActor } = await import('@/lib/gov-discount-ledger/actor')

  try {
    const db = createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS })
    const actor = await resolveLedgerActor(db, grant.tenantId, caller.user)
    const outcome = await recordGovDiscount(createSupabaseLedgerStore(db), grant, actor, new Date())
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

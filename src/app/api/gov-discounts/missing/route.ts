import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveBranchScope } from '@/lib/outlets/branch-scope'
import { requireGovCaller } from '@/lib/gov-discount-ledger/route-guards'

/** The longest window one read may cover (a quarter), so it stays bounded. */
const MAX_WINDOW_MS = 93 * 24 * 60 * 60 * 1000
const UUID = z.string().uuid()

const windowSchema = z.object({
  tenantId: UUID,
  startIso: z.string().datetime({ offset: true }),
  endIso: z.string().datetime({ offset: true }),
})

const recordSchema = z.object({ tenantId: UUID, orderId: UUID }).strict()

/**
 * GET  /api/gov-discounts/missing?tenantId&startIso&endIso
 * POST /api/gov-discounts/missing { tenantId, orderId }
 *
 * The merchant app's "Missing from sales book": platform orders in the window
 * that carry a Senior/PWD discount but have no ledger row (online checkout
 * files its grant best-effort), and "Record now", which builds the record
 * from the STORED order (`missing-service.ts`). Bearer token of someone who
 * reviews discounts; a branch account sees and records only its branch.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = windowSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'A tenant and a period are required.' }, { status: 400 })
  const { tenantId, startIso, endIso } = parsed.data
  const span = Date.parse(endIso) - Date.parse(startIso)
  if (!(span > 0 && span <= MAX_WINDOW_MS)) {
    return NextResponse.json({ error: 'Choose a period of up to three months.' }, { status: 400 })
  }

  const caller = await requireGovCaller(request, tenantId, 'view', 'discount_review')
  if (!caller.ok) return caller.response

  const [{ createAdminClient, ADMIN_QUERY_TIMEOUT_MS }, { loadMissingFromBook }] = await Promise.all([
    import('@/lib/supabase/admin'),
    import('@/lib/gov-discount-ledger/missing-service'),
  ])
  try {
    const db = createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS })
    const orders = await loadMissingFromBook(db, tenantId, { startIso, endIso }, resolveBranchScope(caller.appUser))
    return NextResponse.json({ success: true, orders })
  } catch (error) {
    console.error('[gov-discounts/missing] read failed', { tenantId, error: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'Could not check the sales book.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = recordSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'That order could not be found.' }, { status: 400 })
  const { tenantId, orderId } = parsed.data

  const caller = await requireGovCaller(request, tenantId, 'create', 'discount_review')
  if (!caller.ok) return caller.response

  const [{ createAdminClient, ADMIN_QUERY_TIMEOUT_MS }, { recordMissingOrder, RECORD_MISSING_MESSAGES }, { resolveLedgerActor }] =
    await Promise.all([
      import('@/lib/supabase/admin'),
      import('@/lib/gov-discount-ledger/missing-service'),
      import('@/lib/gov-discount-ledger/actor'),
    ])
  try {
    const db = createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS })
    const actor = await resolveLedgerActor(db, tenantId, caller.user)
    const outcome = await recordMissingOrder(db, {
      tenantId,
      orderId,
      scope: resolveBranchScope(caller.appUser),
      actor,
      now: new Date(),
    })
    if (outcome !== 'recorded') {
      const status = outcome === 'already_recorded' ? 409 : outcome === 'not_found' ? 404 : 400
      return NextResponse.json({ error: RECORD_MISSING_MESSAGES[outcome], code: outcome }, { status })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[gov-discounts/missing] record failed', { tenantId, error: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'Could not record it. Try again.' }, { status: 500 })
  }
}

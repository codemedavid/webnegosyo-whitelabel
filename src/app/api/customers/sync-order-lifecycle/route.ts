import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseLifecycleSyncRequest } from '@/lib/customer-lifecycle-sync'

/**
 * POST /api/customers/sync-order-lifecycle
 *
 * Keeps the platform-side customer ledger in step with an order that lives in a
 * tenant's own Convex or Supabase project.
 *
 * The ledger was written once, at order create, and never touched again — so a
 * cancelled order counted as a customer visit forever, and no loyalty rule could
 * tell a settled sale from an open ticket. The merchant app and the web admin
 * both call this whenever an order's status or payment state changes.
 *
 * Best-effort, and authenticated with the caller's own access token, for exactly
 * the reasons the sibling `capture-order` route gives: the caller has already
 * committed the real change to its own backend, this is the projection catching
 * up, and the write is idempotent so a retry is safe.
 *
 * The tenant check is the CALLER's tenant, never the body's claim alone — the
 * write runs service-role over PII-derived rows, so a caller able to name any
 * tenant here could rewrite another store's customer history.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)

  // The event is stamped on RECEIPT, not by the sender. Ordering these events by
  // a handset's own clock would let one register with a skewed clock permanently
  // out-rank another; a caller that genuinely knows the time (a backfill reading
  // historic orders) may still supply its own.
  const stamped =
    body && typeof body === 'object'
      ? { ...(body as Record<string, unknown>), updatedAt: (body as Record<string, unknown>).updatedAt ?? new Date().toISOString() }
      : body

  const parsed = parseLifecycleSyncRequest(stamped)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const event = parsed.value

  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: appUser } = await supabase
    .from('app_users')
    .select('role, tenant_id')
    .eq('user_id', user.id)
    .single()

  const isAuthorized =
    appUser?.role === 'superadmin' ||
    (appUser?.role === 'admin' && appUser.tenant_id === event.tenantId)

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { syncOrderLifecycle } = await import('@/lib/customer-lifecycle-sync')
  const { createSupabaseLifecycleDeps } = await import('@/lib/customer-lifecycle-store')

  const { runLoyaltyForOrder } = await import('@/lib/loyalty/lifecycle')

  const admin = createAdminClient()
  const result = await syncOrderLifecycle(event, createSupabaseLifecycleDeps(admin))

  // Loyalty runs on every event the ledger knows about — including a replay
  // the sync found `unchanged`, because the previous attempt may have written
  // the ledger and then failed before earning. The earning write is idempotent
  // at the database, so the retry costs a query and never a second stamp.
  const loyalty =
    result === 'not_found'
      ? null
      : await runLoyaltyForOrder(admin, {
          tenantId: event.tenantId,
          backend: event.backend,
          externalOrderId: event.externalOrderId,
        })

  // `not_found` is a normal outcome, not a failure: an anonymous order never
  // produced a ledger row, and there is nothing to keep in step.
  return NextResponse.json({ success: true, result, loyalty })
}

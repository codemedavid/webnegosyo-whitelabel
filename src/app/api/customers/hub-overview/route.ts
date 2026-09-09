import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveBranchScope } from '@/lib/outlets/branch-scope'

/**
 * POST /api/customers/hub-overview
 *
 * The merchant app's Customer Hub: repeat rate over 7/30/90 days, new versus
 * returning, at-risk, identified-order coverage, and the store's top items.
 *
 * Served as a route rather than computed in the app because the app cannot
 * import `src/`, and the repeat-rate definition must not exist twice. The app
 * renders numbers; every one of them is computed here, from whichever backend
 * holds that tenant's identified orders.
 *
 * Read-only, and authenticated with the caller's own access token like its
 * siblings. The tenant is the CALLER's tenant, never the body's claim alone:
 * this returns customer intelligence, and a caller able to name any tenant here
 * could read another store's retention.
 *
 * Gated on `customer_hub_enabled`. That flag defaults FALSE, so a store whose
 * ledger coverage has not been checked gets a clean refusal rather than a
 * confident repeat rate computed from a half-filled ledger.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const tenantId = typeof body?.tenantId === 'string' ? body.tenantId.trim() : ''
  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId is required.' }, { status: 400 })
  }

  const days = Number(body?.days)
  // One read covers every window the Hub shows, so it must span the widest.
  const windowDays = Number.isFinite(days) && days > 0 ? Math.min(days, 400) : 90
  const outletId = typeof body?.outletId === 'string' && body.outletId.trim() ? body.outletId.trim() : null

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
    .select('role, tenant_id, permissions, is_owner, outlet_id')
    .eq('user_id', user.id)
    .single()

  const isAuthorized =
    appUser?.role === 'superadmin' ||
    (appUser?.role === 'admin' && appUser.tenant_id === tenantId)

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Customer history is PII. The same `customers` key that gates the directory
  // gates its summary — a repeat rate is derived from exactly the same rows.
  const { hasPermission } = await import('@/lib/staff-permissions')
  const permitted = hasPermission(
    {
      role: appUser?.role ?? null,
      is_owner: appUser?.is_owner ?? false,
      permissions: (appUser?.permissions as string[] | null) ?? null,
    },
    'customers',
  )
  if (!permitted) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const scope = resolveBranchScope({
    outlet_id: appUser.outlet_id,
    is_owner: appUser.is_owner,
    role: appUser.role,
  })

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { fetchCustomerOrderFacts } = await import('@/lib/queries/customer-facts')
  const { buildCustomerHubOverview } = await import('@/lib/customer-hub-overview')

  const admin = createAdminClient()

  const { data: tenant } = await admin
    .from('tenants')
    .select(
      'id, customer_hub_enabled, order_backend, convex_deployment_url',
    )
    .eq('id', tenantId)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'Store not found.' }, { status: 404 })
  }
  if (tenant.customer_hub_enabled !== true) {
    return NextResponse.json({ error: 'Customer Hub is not enabled for this store.' }, { status: 403 })
  }

  const read = await fetchCustomerOrderFacts(
    { ...(tenant as Record<string, unknown>), id: tenantId } as never,
    { days: windowDays, includeLifetime: true,
      outletId: scope.kind === 'branch' ? scope.outletId : outletId, platformClient: admin as never },
  )

  return NextResponse.json({ success: true, overview: buildCustomerHubOverview(read) })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/inventory/order-stock
 *
 * The POS register in webnegosyo-app writes counter sales straight to the
 * tenant's Convex deployment, so it never passes through `createOrderAction` —
 * the single place order-driven depletion is wired. Without this route, the
 * highest-volume stock event a merchant has (a sale over the counter) would
 * leave stock untouched.
 *
 * The register calls this after the order is safely written, so depletion here
 * is best-effort by the same reasoning as every other backend: the sale is
 * already rung up and paid for. A drifting ledger is reconcilable; a register
 * that refuses to close a sale because of a stock write is not. This route
 * therefore reports success once the caller is authorized, whatever the ledger
 * write then does.
 *
 * Authenticated via the caller's own Supabase access token — same trust level
 * as /api/revalidate-menu and `verifyTenantAdmin` in src/lib/admin-service.ts.
 */

/** One configured line of the sale, as the register sends it. */
interface OrderStockItemInput {
  menuItemId?: unknown
  quantity?: unknown
  optionIds?: unknown
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const tenantId = body?.tenantId
  const orderId = body?.orderId
  const rawItems = body?.items

  if (!tenantId || !orderId) {
    return NextResponse.json(
      { error: 'tenantId and orderId are required' },
      { status: 400 },
    )
  }

  if (!Array.isArray(rawItems)) {
    return NextResponse.json({ error: 'items must be an array' }, { status: 400 })
  }

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
    (appUser?.role === 'admin' && appUser.tenant_id === tenantId)

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Same gate `createOrderAction` applies: a tenant who has not turned
  // inventory on must never accumulate a ledger they did not ask for.
  const { data: tenant } = await supabase
    .from('tenants')
    .select('inventory_enabled')
    .eq('id', tenantId)
    .single()

  if (tenant?.inventory_enabled !== true) {
    return NextResponse.json({ success: true, skipped: 'inventory_disabled' })
  }

  const items = (rawItems as OrderStockItemInput[])
    .filter((item) => typeof item?.menuItemId === 'string' && Number(item?.quantity) > 0)
    .map((item) => {
      const optionIds = toStringArray(item.optionIds)
      return {
        menuItemId: item.menuItemId as string,
        quantity: Number(item.quantity),
        // The same id set feeds both buckets: an id is unique per option, so
        // whichever recipe target exists matches and the other finds nothing.
        // Mirrors `depleteStockForOrder` in src/app/actions/orders.ts.
        optionIds,
        modifierOptionIds: optionIds,
        addonIds: [],
      }
    })

  const { applyOrderStockBestEffort } = await import('@/lib/inventory/order-stock-service')
  await applyOrderStockBestEffort(tenantId, orderId, items)

  return NextResponse.json({ success: true })
}

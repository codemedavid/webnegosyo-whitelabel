import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createConvexServerClient } from '@/lib/convex/server'
import {
  buildDepletionItemsFromConvexOrderItems,
  buildDepletionItemsFromOrderRows,
} from '@/lib/inventory/customer-order-items'
import { applyOrderStockBestEffort } from '@/lib/inventory/order-stock-service'
import { reportStockFailure } from '@/lib/inventory/stock-failure-report'

/**
 * POST /api/inventory/customer-order-stock
 *
 * The white-labeled customer app (`mobile/`) writes its orders straight to the
 * platform `orders` table — or, for Convex-backend tenants, to that tenant's
 * own Convex deployment — so it never passes through `createOrderAction` where
 * order-driven depletion is wired. Until this existed, an order placed in a
 * merchant's own branded app moved no stock at all — no depletion, no low-stock
 * alert, no auto-86 — while the same order placed on the web moved all three.
 *
 * WHY THIS ROUTE IS UNAUTHENTICATED, AND WHY THAT IS SAFE.
 * A diner has no account, so this cannot be gated on a merchant session the way
 * /api/inventory/order-stock is for the register. It is guarded by carrying
 * nothing steerable instead: the caller names a tenant and an order, and every
 * dish and quantity is read back out of the order the backend already holds —
 * the platform `orders` table, or the tenant's Convex deployment queried
 * server-side with the deploy key only the platform knows. Any `items` in the
 * body are ignored on both paths. The worst a forged call can achieve is
 * triggering the depletion that order had already earned, and the ledger's
 * order+direction guard means that happens once. (The ledger's order_id is
 * TEXT precisely so a Convex id fits alongside platform UUIDs.)
 *
 * Best-effort by the same reasoning as every other depletion path: by the time
 * this runs the order is saved and the customer is looking at a confirmation. A
 * stock failure must never turn that into an error they cannot act on.
 *
 * NOT covered: tenants whose orders live in their own Supabase project. Those
 * orders are in neither store this route can read back, so the same guarantee
 * cannot be made without trusting the caller's lines.
 */

interface TenantStockConfig {
  inventory_enabled: boolean | null
  convex_deployment_url: string | null
  convex_deploy_key: string | null
}

/** Shape of `orders:getOrderById` as far as depletion cares. */
interface ConvexOrderForStock {
  outletId?: string | null
  items?: unknown[]
}

/**
 * Reads the order's lines back out of the tenant's own Convex deployment and
 * spends them. Same trust boundary as the platform branch — the deployment is
 * the source of truth, the request body contributes nothing.
 */
async function depleteConvexOrder(
  tenant: TenantStockConfig,
  tenantId: string,
  orderId: string,
): Promise<NextResponse> {
  if (!tenant.convex_deploy_key) {
    // Graceful degradation, not an error: a half-configured tenant depletes
    // nothing — exactly what this path did before it existed — and a diner
    // must never be shown a stock concern.
    console.warn(
      '[inventory] Convex tenant has no deploy key; skipping depletion',
      tenantId,
    )
    return NextResponse.json({ success: true, skipped: 'convex_unconfigured' })
  }

  const convex = createConvexServerClient(
    tenant.convex_deployment_url as string,
    tenant.convex_deploy_key,
  )
  const order = await convex.query<ConvexOrderForStock | null>(
    'orders:getOrderById',
    { orderId },
  )

  // Tenancy is structural here: each deployment belongs to exactly one tenant,
  // so an order this deployment does not hold is not this caller's to act on.
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const items = buildDepletionItemsFromConvexOrderItems(
    Array.isArray(order.items) ? order.items : [],
  )
  if (items.length > 0) {
    // The branch comes off the stored order, never off the request body.
    await applyOrderStockBestEffort(
      tenantId,
      orderId,
      items,
      'sale',
      0,
      typeof order.outletId === 'string' ? order.outletId : null,
    )
  }

  return NextResponse.json({ success: true })
}

/** The original path: lines read back out of the platform `orders` table. */
async function depletePlatformOrder(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  orderId: string,
): Promise<NextResponse> {
  // The order is what makes this payload trustworthy, so it is checked before
  // anything is spent. A missing order and one belonging to another tenant
  // answer the same way — neither is this caller's to act on.
  // The branch comes off the stored order, never off the request body: this
  // route is public, and a caller who could name the branch could deplete a
  // shop they have nothing to do with.
  const { data: order } = await supabase
    .from('orders')
    .select('tenant_id, outlet_id')
    .eq('id', orderId)
    .single()

  if (!order || order.tenant_id !== tenantId) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const { data: lines } = await supabase
    .from('order_items')
    .select('menu_item_id, quantity')
    .eq('order_id', orderId)

  const items = buildDepletionItemsFromOrderRows(lines ?? [])
  if (items.length > 0) {
    await applyOrderStockBestEffort(
      tenantId,
      orderId,
      items,
      'sale',
      0,
      (order as { outlet_id?: string | null }).outlet_id ?? null,
    )
  }

  return NextResponse.json({ success: true })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const tenantId = body?.tenantId
  const orderId = body?.orderId

  if (typeof tenantId !== 'string' || typeof orderId !== 'string') {
    return NextResponse.json(
      { error: 'tenantId and orderId are required' },
      { status: 400 },
    )
  }

  try {
    const supabase = createAdminClient()

    // Same gate `createOrderAction` applies: a tenant who has not turned
    // inventory on must never accumulate a ledger they did not ask for.
    const { data: tenant } = await supabase
      .from('tenants')
      .select('inventory_enabled, convex_deployment_url, convex_deploy_key')
      .eq('id', tenantId)
      .single()

    if (tenant?.inventory_enabled !== true) {
      return NextResponse.json({ success: true, skipped: 'inventory_disabled' })
    }

    // Same discriminator the checkout itself uses: a deployment URL means the
    // order lives in the tenant's Convex, not the platform table.
    if (tenant.convex_deployment_url) {
      return await depleteConvexOrder(
        tenant as TenantStockConfig,
        tenantId,
        orderId,
      )
    }

    return await depletePlatformOrder(supabase, tenantId, orderId)
  } catch (error) {
    // Reported as success on purpose. The order is placed; a diner has no way
    // to act on a stock error and no reason to be shown one. The ledger is
    // reconcilable by stocktake, a frightened customer is not.
    //
    // Failures inside `applyOrderStockBestEffort` never reach this catch — the
    // wrapper swallows and reports them itself — so this covers only the
    // route's own reads (tenant lookup, Convex query) without double-reporting.
    reportStockFailure({ tenantId, orderId, operation: 'customer_order_stock_route' }, error)
    return NextResponse.json({ success: true, skipped: 'error' })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'
import { createAdminClient } from '@/lib/supabase/admin'
import { createConvexServerClient } from '@/lib/convex/server'
import { getTenantSecrets } from '@/lib/tenant-secrets'
import { pushOrderToLoyverseBestEffort } from '@/lib/loyverse/push-service'
import { buildLoyverseOrderItemsFromConvexOrder } from '@/lib/loyverse/convex-order-lines'
import { loyversePushBodySchema } from '@/lib/loyverse/push-request'
import type { OrderItem } from '@/types/database'
import { isUuid } from '@/lib/uuid'

/** Nothing was pushed, and that is not an error the merchant can act on. */
function skipped(reason: string): NextResponse {
  return NextResponse.json({
    success: false,
    skipped: true,
    receiptNumber: null,
    unmapped: [],
    error: reason,
  })
}

/**
 * Reads a Convex-backend order's lines back out of the tenant's own deployment.
 *
 * Same trust boundary as `/api/inventory/customer-order-stock`: the caller
 * names a tenant and an order, and every dish, quantity and price comes from
 * the deployment, queried with the deploy key only the platform holds.
 *
 * Returns null for every "cannot read it" case — an unconfigured tenant, an
 * unreachable deployment, an order that is in neither store. The confirm has
 * already succeeded by the time this runs, so a missing receipt is reconcilable
 * in Back Office; an error on the confirm screen is not.
 */
async function loadConvexOrderItems(
  tenantId: string,
  orderId: string,
): Promise<OrderItem[] | null> {
  const admin = createAdminClient()
  const { data: tenant } = await admin
    .from('tenants')
    .select('convex_deployment_url')
    .eq('id', tenantId)
    .maybeSingle()

  const config = tenant as { convex_deployment_url?: string | null } | null
  if (!config?.convex_deployment_url) return null

  try {
    const deployKey = (await getTenantSecrets(admin, tenantId))?.convex_deploy_key
    if (!deployKey) return null

    const convex = createConvexServerClient(config.convex_deployment_url, deployKey)
    const order = await convex.query<{ items?: unknown[] } | null>(
      'orders:getOrderByIdInternal',
      { orderId },
    )
    if (!order || !Array.isArray(order.items)) return null

    const items = buildLoyverseOrderItemsFromConvexOrder(order.items)
    return items.length > 0 ? items : null
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Convex read failed'
    console.error('[Loyverse] could not read Convex order lines:', message)
    return null
  }
}

/**
 * POST /api/loyverse — merchant-app entry point for pushing an order into
 * Loyverse as a sales receipt.
 *
 * Runs on the server for the same reason /api/lalamove does: the tenant's
 * Loyverse access token signs every request and must never ship in an app
 * bundle. Authenticated with the caller's own Supabase access token, then
 * authorised against app_users, because the tenant and order are read with
 * the service key which bypasses RLS.
 *
 * Two shapes:
 * - { tenantId, orderId }             — platform-backend order; items are read
 *                                       (and the outcome recorded) server-side.
 * - { tenantId, items, orderNumber? } — Convex / tenant-Supabase order or POS
 *                                       counter sale; the app supplies the
 *                                       lines and there is no platform row to
 *                                       record on. The caller must invoke this
 *                                       exactly once per order (it fires on a
 *                                       status transition / tender completion).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = loyversePushBodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const message = issue?.path[0] === 'tenantId' ? 'tenantId is required' : (issue?.message ?? 'Invalid request')
    return NextResponse.json({ error: message }, { status: 400 })
  }
  const { tenantId, orderId, orderNumber, items, context } = parsed.data

  const caller = await requireBearerStoreCaller(request, tenantId, 'create')
  if (!caller.ok) return caller.response

  let orderItems: OrderItem[] = items ?? []
  let platformOrderId: string | null = null

  // The app sends whatever ids it has. Resolution runs platform row → caller-
  // supplied items → the tenant's Convex deployment, so a surface that holds
  // the lines spends no extra round trip and one that holds only an order id
  // (the orders list, the register drawer) still pushes.
  if (orderId) {
    const admin = createAdminClient()
    // A Convex id is not a uuid; asking Postgres for it is a 400, not a miss.
    const { data: orderRow } = isUuid(orderId)
      ? await admin
          .from('orders')
          .select('id')
          .eq('id', orderId)
          .eq('tenant_id', tenantId)
          .maybeSingle()
      : { data: null }
    if (orderRow) {
      // Platform order: the push service reads order_items and records the
      // outcome on the row; caller-sent items are ignored in favour of the
      // server's own copy.
      platformOrderId = (orderRow as { id: string }).id
      orderItems = []
    } else if (!items) {
      const convexItems = await loadConvexOrderItems(tenantId, orderId)
      if (!convexItems) return skipped('Order lines could not be read')
      orderItems = convexItems
    }
  }

  // POS counter sales are complete the moment they are tendered — they never
  // pass through "confirmed", so they always push. Online-order confirmations
  // stay gated by the tenant's push mode (an on_create tenant already pushed
  // at checkout; pushing again here would double-count the sale).
  const result = await pushOrderToLoyverseBestEffort({
    tenantId,
    orderId: platformOrderId,
    orderNumber,
    items: orderItems,
    trigger: context === 'pos_sale' ? 'manual' : 'confirm',
  })

  return NextResponse.json({
    success: result.success,
    skipped: result.skipped,
    receiptNumber: result.receiptNumber ?? null,
    unmapped: result.unmapped,
    error: result.error ?? null,
  })
}

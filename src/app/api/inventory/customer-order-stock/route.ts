import { NextRequest, NextResponse } from 'next/server'
import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import { createAdminClient } from '@/lib/supabase/admin'
import { readInventorySelectionSnapshot } from '@/lib/inventory-selection-snapshot'
import { createConvexServerClient } from '@/lib/convex/server'
import { getTenantSecrets } from '@/lib/tenant-secrets'
import {
  buildDepletionItemsFromConvexOrderItems,
  buildDepletionItemsFromOrderRows,
} from '@/lib/inventory/customer-order-items'
import { applyOrderStockBestEffort } from '@/lib/inventory/order-stock-service'
import { reportStockFailure } from '@/lib/inventory/stock-failure-report'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'
import type { DepletionOrderItem } from '@/lib/inventory/order-depletion'

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
 * Beyond reading the lines back, the route only acts on the order the customer
 * app has just placed. The app calls it within seconds of saving, so an order
 * older than {@link FRESH_ORDER_MS}, or one placed by another channel, is
 * answered `skipped: 'order_not_eligible'` — a forged call can no longer reach
 * back into the store's history. Web checkout and the register deplete on their
 * own paths (`createOrderAction`, `/api/inventory/order-stock`). Each address
 * and each order has its own allowance, and one call may not spend more than
 * {@link MAX_ORDER_UNITS} units.
 *
 * What counts as "the customer app": a Convex deployment stamps `source:
 * 'mobile'`. The app's platform insert names no source, so the column default
 * `'web'` is what a platform customer-app order carries; `'pos'` and
 * `'qr_handoff'` are staff-made and have their own stock calls, so only those
 * are refused there. (Having the app send `source: 'mobile'` would let the
 * platform side be as strict, but needs a new app build.)
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

/** The app calls within seconds of saving; this allows for a slow connection and a retry. */
const FRESH_ORDER_MS = 15 * 60 * 1000

/** Far above any real cart (the checkout caps a line at 99), far below a made-up order. */
const MAX_ORDER_UNITS = 500

/** Per address, across every store: a shop's diners may share one Wi-Fi. */
const IP_RATE_LIMIT: RateLimitOptions = { limit: 60, windowSec: 60, onRedisFailure: 'instance' }

/** The app sends one call per order (the claim makes a repeat a no-op); a few covers retries. */
const ORDER_RATE_LIMIT: RateLimitOptions = { limit: 5, windowSec: 600, onRedisFailure: 'instance' }

/** Sources the customer app's orders carry, per backend (see the header). */
const CUSTOMER_APP_SOURCES: Record<'platform' | 'convex', readonly string[]> = {
  platform: ['web', 'mobile'],
  convex: ['mobile'],
}

function notEligible(): NextResponse {
  return NextResponse.json({ success: true, skipped: 'order_not_eligible' })
}

function isFreshCustomerAppOrder(
  backend: 'platform' | 'convex',
  source: unknown,
  placedAtMs: number,
  nowMs: number,
): boolean {
  if (typeof source !== 'string' || !CUSTOMER_APP_SOURCES[backend].includes(source)) return false
  return Number.isFinite(placedAtMs) && nowMs - placedAtMs <= FRESH_ORDER_MS && placedAtMs <= nowMs + FRESH_ORDER_MS
}

function tooManyRequests(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  )
}

function totalUnits(items: readonly DepletionOrderItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0)
}

/** A diner has no account, so the audit log names the path and nobody. */
const CUSTOMER_APP_AUDIT = { context: { source: 'customer_app' as const } }

/** Shape of `orders:getOrderById` as far as depletion cares. */
interface ConvexOrderForStock {
  _creationTime?: number
  source?: string
  customerData?: unknown
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
    'orders:getOrderByIdInternal',
    { orderId },
  )

  // Tenancy is structural here: each deployment belongs to exactly one tenant,
  // so an order this deployment does not hold is not this caller's to act on.
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }
  if (!isFreshCustomerAppOrder('convex', order.source, Number(order._creationTime), Date.now())) {
    return notEligible()
  }

  const savedItems = buildDepletionItemsFromConvexOrderItems(Array.isArray(order.items) ? order.items : [])
  const items = readInventorySelectionSnapshot(order.customerData, savedItems) ?? savedItems
  if (totalUnits(items) > MAX_ORDER_UNITS) return notEligible()
  if (items.length > 0) {
    // The branch comes off the stored order, never off the request body.
    await applyOrderStockBestEffort(
      tenantId,
      orderId,
      items,
      'sale',
      0,
      typeof order.outletId === 'string' ? order.outletId : null,
      CUSTOMER_APP_AUDIT,
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
    .select('tenant_id, outlet_id, customer_data, source, created_at')
    .eq('id', orderId)
    .single()

  if (!order || order.tenant_id !== tenantId) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }
  const { source, created_at: createdAt } = order as { source?: unknown; created_at?: unknown }
  if (!isFreshCustomerAppOrder('platform', source, Date.parse(String(createdAt)), Date.now())) {
    return notEligible()
  }

  const { data: lines } = await supabase
    .from('order_items')
    .select('menu_item_id, quantity')
    .eq('order_id', orderId)

  const savedItems = buildDepletionItemsFromOrderRows(lines ?? [])
  const items = readInventorySelectionSnapshot((order as { customer_data?: unknown }).customer_data, savedItems) ?? savedItems
  if (totalUnits(items) > MAX_ORDER_UNITS) return notEligible()
  if (items.length > 0) {
    await applyOrderStockBestEffort(
      tenantId,
      orderId,
      items,
      'sale',
      0,
      (order as { outlet_id?: string | null }).outlet_id ?? null,
      CUSTOMER_APP_AUDIT,
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

  const ipRate = await checkRateLimit(`customer-order-stock:ip:${getClientIP(request) ?? 'unknown'}`, IP_RATE_LIMIT)
  if (!ipRate.allowed) return tooManyRequests(ipRate.retryAfterSec)
  const orderRate = await checkRateLimit(`customer-order-stock:order:${orderId}`, ORDER_RATE_LIMIT)
  if (!orderRate.allowed) return tooManyRequests(orderRate.retryAfterSec)

  try {
    const supabase = createAdminClient()

    // Same gate `createOrderAction` applies: a tenant who has not turned
    // inventory on must never accumulate a ledger they did not ask for.
    const { data: tenant } = await supabase
      .from('tenants')
      .select('inventory_enabled, order_backend, convex_deployment_url')
      .eq('id', tenantId)
      .single()

    if (tenant?.inventory_enabled !== true) {
      return NextResponse.json({ success: true, skipped: 'inventory_disabled' })
    }

    // The same resolver checkout writes through. Never route on the URL alone:
    // a platform-pinned store with a leftover Convex URL keeps its orders on
    // the platform, and reading Convex for them spent nothing.
    // The column is typed `string`; `resolveOrderBackend` validates the value itself.
    const backend = resolveOrderBackend(tenant as OrderBackendTenantFields)
    if (backend === 'supabase') {
      // Orders live in the tenant's own Supabase project; checkout already
      // depletes them in createOrderAction, and the platform table has none.
      return NextResponse.json({ success: true, skipped: 'unsupported_backend' })
    }
    if (backend === 'convex' && tenant.convex_deployment_url) {
      const secrets = await getTenantSecrets(supabase, tenantId)
      return await depleteConvexOrder(
        {
          inventory_enabled: tenant.inventory_enabled,
          convex_deployment_url: tenant.convex_deployment_url,
          convex_deploy_key: secrets?.convex_deploy_key ?? null,
        },
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

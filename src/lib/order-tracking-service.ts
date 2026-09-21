/**
 * Server-side order tracking data fetcher.
 * Shared between the SSR page (initial load) and the API route (polling).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createConvexServerClient } from '@/lib/convex/server'
import { getTenantSecrets } from '@/lib/tenant-secrets'
import { verifyTrackingToken } from '@/lib/tracking-token'
import { getOrderScheduledLabel } from '@/lib/advance-order-utils'
import { isRealContact } from '@/lib/order-contact'
import { resolveCustomerIdentity } from '@/lib/customer-identity'
import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import { createTenantOrderRealtimeClient } from '@/lib/supabase/tenant-order-client'
import { fetchTenantOrderById } from '@/lib/tenant-supabase-orders-read'
import type { OrderFactsBackend } from '@/lib/customer-order-facts'
import {
  isPickupScanEnabled,
  resolveOrderTypeKind,
  type OrderTypeKind,
} from '@/lib/pickup-qr-gating'

export interface TrackingOrderItem {
  name: string
  quantity: number
  price: number
  subtotal: number
  variation?: string
  addons?: string[]
}

export interface TrackingData {
  status: string
  items: TrackingOrderItem[]
  total: number
  deliveryFee?: number
  serviceChargeAmount?: number
  orderType?: string
  /**
   * The order's fulfilment kind, resolved from the order-type row where
   * possible. `orderType` above is a display label a merchant can rename, so
   * it must not be used to make behavioural decisions. Null = unresolved.
   */
  orderTypeKind?: OrderTypeKind | null
  /**
   * The store's scan-to-collect switch. Read by the customer page to decide
   * whether to render the QR, and by the merchant app — which cannot query the
   * tenants table — to decide whether to accept a scanned ticket at all.
   */
  pickupScanEnabled?: boolean
  customerName?: string
  /**
   * Whether the order already carries a real (non-placeholder) contact. The
   * tracking page shows the receipt-QR contact form only when false; the
   * contact itself is never exposed here — the token is printed on paper.
   */
  hasContact?: boolean
  dailyNumber?: number | null
  createdAt: string
  isTerminal: boolean
  /** Pre-computed, hydration-safe label for a scheduled (advance) order, or null for ASAP. */
  scheduledLabel?: string | null
  /**
   * The absolute instant the kitchen promised this order would be ready, or
   * null when no chef has committed to a time. The countdown on the tracking
   * page is derived from this and nothing else — a stored duration cannot know
   * when its clock started.
   */
  promisedReadyAt?: string | null
  /** What the chef actually chose. Kept for the merchant, not rendered here. */
  prepMinutes?: number | null
  /**
   * The server's clock at the moment this payload was built. The page counts
   * down from this rather than `Date.now()`, so a device whose clock is twenty
   * minutes fast does not show a nonsense estimate for an on-time order.
   */
  serverNowMs?: number
}

/** Server-only identity for loyalty reads; never serialized by the tracking API. */
interface TrackingContextData extends TrackingData {
  loyaltyIdentity: {
    customerKey: string | null
    outletId: string | null
    backend: OrderFactsBackend
    source: 'pos' | 'online'
    paymentStatus: string | null
    observedAt: string
  }
}

export async function fetchOrderTrackingData(
  orderId: string,
  token: string,
  tenantId: string,
): Promise<{ data: TrackingData | null; error: string | null }> {
  const result = await fetchOrderTrackingContext(orderId, token, tenantId)
  if (!result.data) return { data: null, error: result.error }
  // Strip the private identity before returning data to the page or API.
  const { loyaltyIdentity, ...data } = result.data
  void loyaltyIdentity
  return { data, error: result.error }
}

/**
 * The tenant columns that decide where this order lives.
 *
 * `order_backend` is the load-bearing one: it is a deliberate superadmin pin,
 * and routing on the credentials alone ignores it. A store pinned to the
 * platform database that still carries a Convex deployment URL from an earlier
 * setup writes its orders to the platform database and had them looked up in
 * Convex — which is how a customer who had just ordered was told, seconds
 * later, that no such order exists.
 *
 * Every column named here exists on `public.tenants`; see the note on
 * `fetchPickupScanEnabled` for why this list is kept deliberately short.
 */
const TENANT_ROUTING_COLUMNS =
  'order_backend, convex_deployment_url, supabase_order_url, supabase_order_anon_key'

/**
 * Fetch order tracking data server-side.
 *
 * Verifies the HMAC token, then reads the order from whichever backend
 * `resolveOrderBackend` names — the SAME resolver checkout writes through and
 * the merchant's order queue reads through, so the three can never disagree
 * about where a given store's orders live.
 */
export async function fetchOrderTrackingContext(
  orderId: string,
  token: string,
  tenantId: string
): Promise<{ data: TrackingContextData | null; error: string | null }> {
  if (!verifyTrackingToken(orderId, token)) {
    return { data: null, error: 'Invalid tracking token' }
  }

  try {
    const supabaseAdmin = createAdminClient()

    const { data: tenantConfig } = await supabaseAdmin
      .from('tenants')
      .select(TENANT_ROUTING_COLUMNS)
      .eq('id', tenantId)
      .eq('is_active', true)
      .single()

    const config = tenantConfig as OrderBackendTenantFields | null

    if (!config) {
      return { data: null, error: 'Restaurant not found' }
    }

    const backend = resolveOrderBackend(config)

    let result: TrackingContextData

    if (backend === 'convex') {
      const deployKey = (await getTenantSecrets(supabaseAdmin, tenantId))?.convex_deploy_key
      if (!config.convex_deployment_url || !deployKey) {
        // Checkout refuses to write for this store (`assertOrderBackendReady`
        // throws), so there is no order to find. Reading the platform database
        // instead would be the same silent misroute in the other direction.
        console.error('[Order Tracking] Convex backend is not reachable for tenant', tenantId)
        return { data: null, error: 'Order not found' }
      }
      result = await fetchFromConvex(
        config.convex_deployment_url,
        deployKey,
        orderId,
        supabaseAdmin,
        tenantId
      )
    } else if (backend === 'supabase') {
      result = await fetchFromTenantSupabase(config, supabaseAdmin, orderId, tenantId)
    } else {
      result = await fetchFromSupabase(supabaseAdmin, orderId, tenantId)
    }

    // Read after the order, and separately, so the switch can never take the
    // whole tracking page down with it. Both backends get the same answer
    // because the flag lives on the platform tenants row either way.
    const pickupScanEnabled = await fetchPickupScanEnabled(supabaseAdmin, tenantId)

    return {
      data: { ...result, pickupScanEnabled, serverNowMs: Date.now() },
      error: null,
    }
  } catch (err) {
    console.error('[Order Tracking] Error:', err instanceof Error ? err.message : err)
    return { data: null, error: 'Order not found' }
  }
}

/**
 * Look up an order type's fixed kind by id.
 *
 * Order types live in the platform Supabase for every tenant, including
 * Convex ones, so this is the single authority for both fetch paths. Returns
 * null on any failure — the caller then falls back to the snapshot string,
 * and an unresolved kind simply hides the pickup QR.
 */
/**
 * Read the store's scan-to-collect switch.
 *
 * Kept out of the tenant-config select on purpose: naming a column that a
 * deployment has not migrated yet fails the whole query, and that query is
 * what decides whether the order can be found at all. Here the worst case is
 * an isolated failure that falls back to the column's own default — enabled,
 * which is today's behaviour.
 */
async function fetchPickupScanEnabled(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('tenants')
      .select('pickup_scan_enabled')
      .eq('id', tenantId)
      .maybeSingle()

    return isPickupScanEnabled(
      (data as { pickup_scan_enabled?: boolean | null } | null)?.pickup_scan_enabled
    )
  } catch {
    return true
  }
}

/** The two prep-time columns, read on their own. */
const PREP_TIME_COLUMNS = 'prep_minutes, promised_ready_at'

/**
 * Read the kitchen's promise separately from the order itself.
 *
 * Same reasoning as `fetchPickupScanEnabled` above: the order query names an
 * explicit column list, and naming a column a deployment has not migrated yet
 * fails the ENTIRE query — which would take the customer's order page down
 * rather than merely hiding an estimate. Isolated here, the worst case is no
 * estimate, which is exactly what every order looked like yesterday.
 */
async function fetchPrepPromise(
  supabase: ReturnType<typeof createAdminClient>,
  orderId: string,
  tenantId: string
): Promise<{ promisedReadyAt: string | null; prepMinutes: number | null }> {
  try {
    const { data } = await supabase
      .from('orders')
      .select(PREP_TIME_COLUMNS)
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    const row = data as { prep_minutes?: number | null; promised_ready_at?: string | null } | null
    return {
      promisedReadyAt: row?.promised_ready_at ?? null,
      prepMinutes: row?.prep_minutes ?? null,
    }
  } catch {
    return { promisedReadyAt: null, prepMinutes: null }
  }
}

async function fetchOrderTypeKind(
  supabase: ReturnType<typeof createAdminClient>,
  orderTypeId: string | null | undefined,
  tenantId: string
): Promise<string | null> {
  if (!orderTypeId) return null

  try {
    const { data } = await supabase
      .from('order_types')
      .select('type')
      .eq('id', orderTypeId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    return (data as { type?: string } | null)?.type ?? null
  } catch {
    return null
  }
}

async function fetchFromConvex(
  convexUrl: string,
  convexKey: string,
  orderId: string,
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string
): Promise<TrackingContextData> {
  const convex = createConvexServerClient(convexUrl, convexKey)
  // Timestamp BEFORE reading: a newer lifecycle event must win a race.
  const observedAt = new Date().toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = await convex.query<any>('orders:getOrderByIdInternal', { orderId })

  if (!order) throw new Error('Order not found in Convex')

  const isTerminal = order.status === 'delivered' || order.status === 'cancelled'
  const orderTypeFromRow = await fetchOrderTypeKind(
    supabase,
    order.orderTypeId,
    tenantId
  )

  return {
    status: order.status,
    items: (order.items || []).map((item: Record<string, unknown>) => ({
      name: item.menuItemName as string,
      quantity: item.quantity as number,
      price: item.price as number,
      subtotal: item.subtotal as number,
      variation: item.variation as string | undefined,
      addons: item.addons
        ? (item.addons as Array<{ name: string }>).map(a => a.name)
        : undefined,
    })),
    total: order.total,
    deliveryFee: order.deliveryFee,
    orderType: order.orderType,
    orderTypeKind: resolveOrderTypeKind({
      orderTypeFromRow,
      orderTypeSnapshot: order.orderType ?? null,
    }),
    customerName: order.customerName,
    hasContact: isRealContact(order.customerContact) || Boolean(resolveCustomerIdentity({ customerData: order.customerData }).identityKey),
    loyaltyIdentity: {
      customerKey: resolveCustomerIdentity({ contact: order.customerContact, customerData: order.customerData }).identityKey,
      outletId: order.outletId ?? null,
      backend: 'convex',
      source: order.source === 'pos' ? 'pos' : 'online',
      paymentStatus: order.paymentStatus ?? null,
      observedAt,
    },
    dailyNumber: order.dailyNumber,
    createdAt: new Date(order.saleOccurredAt ?? order._creationTime).toISOString(),
    isTerminal,
    promisedReadyAt: order.promisedReadyAt ?? null,
    prepMinutes: order.prepMinutes ?? null,
    scheduledLabel: getOrderScheduledLabel({
      scheduled_for: null,
      customer_data: (order.customerData ?? null) as Record<string, unknown> | null,
    }),
  }
}

/** The line items, projected the same way on both attempts. */
const ORDER_ITEMS_SELECT =
  'order_items(menu_item_name, quantity, price, subtotal, variation, addons)'

/** The columns the tracking page renders, named explicitly to keep the row small. */
const ORDER_TRACKING_SELECT = `
      id, status, total, delivery_fee, service_charge_amount, order_type, order_type_id, customer_name, customer_contact, outlet_id, source, payment_status, created_at, daily_number,
      scheduled_for, customer_data,
      ${ORDER_ITEMS_SELECT}
    `

/**
 * The retry projection. `*` cannot name a column that does not exist, so it
 * cannot go stale — the same escape `fetch-tenant-by-slug.ts` uses.
 */
const ORDER_TRACKING_FALLBACK_SELECT = `*, ${ORDER_ITEMS_SELECT}`

/** PostgREST surfaces Postgres `undefined_column` as SQLSTATE 42703. */
const UNDEFINED_COLUMN_CODE = '42703'

function isUndefinedColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === UNDEFINED_COLUMN_CODE || Boolean(error.message?.includes('does not exist'))
}

function queryPlatformOrder(
  supabase: ReturnType<typeof createAdminClient>,
  orderId: string,
  tenantId: string,
  projection: string
) {
  return supabase
    .from('orders')
    .select(projection)
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .single()
}

/**
 * Read the order row, tolerating a projection the database has not caught up to.
 *
 * PostgREST rejects the WHOLE query when a single projected column is absent,
 * and code is always deployed before its migration is applied — if only for a
 * moment. Treating that as "no such order" is what told every customer on the
 * shared platform database that the order they had just placed was still being
 * processed, for as long as they kept the page open. A column the database
 * lacks must degrade to a missing FIELD, never to a missing ORDER.
 */
async function readPlatformOrderRow(
  supabase: ReturnType<typeof createAdminClient>,
  orderId: string,
  tenantId: string
) {
  const attempt = await queryPlatformOrder(supabase, orderId, tenantId, ORDER_TRACKING_SELECT)
  if (!isUndefinedColumnError(attempt.error)) return attempt

  console.error(
    '[Order Tracking] Order projection is ahead of the database; retrying with *:',
    attempt.error?.message
  )
  return queryPlatformOrder(supabase, orderId, tenantId, ORDER_TRACKING_FALLBACK_SELECT)
}

async function fetchFromSupabase(
  supabase: ReturnType<typeof createAdminClient>,
  orderId: string,
  tenantId: string
): Promise<TrackingContextData> {
  const { data: order, error } = await readPlatformOrderRow(supabase, orderId, tenantId)

  if (error || !order) throw new Error('Order not found in Supabase')

  const orderTypeFromRow = await fetchOrderTypeKind(
    supabase,
    (order as { order_type_id?: string | null }).order_type_id,
    tenantId
  )
  const prepPromise = await fetchPrepPromise(supabase, orderId, tenantId)

  return mapSupabaseOrderRow(order, {
    backend: 'platform_supabase',
    orderTypeFromRow,
    ...prepPromise,
  })
}

/**
 * Read the order from the tenant's OWN Supabase project (`order_backend =
 * 'supabase'`).
 *
 * Uses the anon-key client, not the service-role one: this runs on a public,
 * customer-reachable path, the standalone bundle's SELECT policy already
 * covers it, and handing a service-role key to a page a stranger can open is
 * a bigger key than the job needs.
 *
 * Order types stay on the PLATFORM database for every backend, so the kind
 * lookup still goes through the admin client. The tenant bundle has no
 * `prep_minutes` / `promised_ready_at` columns, so no estimate is promised.
 */
async function fetchFromTenantSupabase(
  config: OrderBackendTenantFields,
  supabase: ReturnType<typeof createAdminClient>,
  orderId: string,
  tenantId: string
): Promise<TrackingContextData> {
  const order = await fetchTenantOrderById(
    createTenantOrderRealtimeClient(config),
    tenantId,
    orderId
  )

  if (!order) throw new Error('Order not found in the tenant Supabase project')

  const orderTypeFromRow = await fetchOrderTypeKind(supabase, order.order_type_id as string | null, tenantId)

  return mapSupabaseOrderRow(order, {
    backend: 'tenant_supabase',
    orderTypeFromRow,
    promisedReadyAt: null,
    prepMinutes: null,
  })
}

/**
 * The one projection from a Postgres order row into tracking data, shared by
 * the platform database and a tenant's own project. Their column names are
 * identical by design — the standalone bundle in `supabase-order-schema.ts`
 * mirrors the platform table — so one mapper serves both, and a field added to
 * the customer's view can never appear on only one of them.
 */
function mapSupabaseOrderRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: any,
  context: {
    backend: Extract<OrderFactsBackend, 'platform_supabase' | 'tenant_supabase'>
    orderTypeFromRow: string | null
    promisedReadyAt: string | null
    prepMinutes: number | null
  }
): TrackingContextData {
  const o = order
  const isTerminal = o.status === 'delivered' || o.status === 'cancelled'
  const { backend, orderTypeFromRow, promisedReadyAt, prepMinutes } = context

  return {
    status: o.status,
    items: (o.order_items || []).map((item: Record<string, unknown>) => ({
      name: item.menu_item_name as string,
      quantity: item.quantity as number,
      price: item.price as number,
      subtotal: item.subtotal as number,
      variation: item.variation as string | undefined,
      addons: Array.isArray(item.addons) ? item.addons as string[] : undefined,
    })),
    total: o.total,
    deliveryFee: o.delivery_fee,
    serviceChargeAmount: o.service_charge_amount,
    orderType: o.order_type,
    orderTypeKind: resolveOrderTypeKind({
      orderTypeFromRow,
      orderTypeSnapshot: o.order_type ?? null,
    }),
    customerName: o.customer_name,
    hasContact: isRealContact(o.customer_contact) || Boolean(resolveCustomerIdentity({ customerData: o.customer_data }).identityKey),
    loyaltyIdentity: {
      customerKey: resolveCustomerIdentity({ contact: o.customer_contact, customerData: o.customer_data }).identityKey,
      outletId: o.outlet_id ?? null,
      backend,
      source: o.source === 'pos' ? 'pos' : 'online',
      paymentStatus: o.payment_status ?? null,
      observedAt: new Date().toISOString(),
    },
    dailyNumber: o.daily_number ?? o.daily_order_number ?? null,
    createdAt: o.created_at,
    isTerminal,
    promisedReadyAt,
    prepMinutes,
    scheduledLabel: getOrderScheduledLabel({
      scheduled_for: o.scheduled_for ?? null,
      customer_data: (o.customer_data ?? null) as Record<string, unknown> | null,
    }),
  }
}

/**
 * Server-side order tracking data fetcher.
 * Shared between the SSR page (initial load) and the API route (polling).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createConvexServerClient } from '@/lib/convex/server'
import { verifyTrackingToken } from '@/lib/tracking-token'
import { getOrderScheduledLabel } from '@/lib/advance-order-utils'
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
  createdAt: string
  isTerminal: boolean
  /** Pre-computed, hydration-safe label for a scheduled (advance) order, or null for ASAP. */
  scheduledLabel?: string | null
}

/**
 * Fetch order tracking data server-side.
 * Verifies HMAC token, then queries Supabase or Convex depending on tenant config.
 */
export async function fetchOrderTrackingData(
  orderId: string,
  token: string,
  tenantId: string
): Promise<{ data: TrackingData | null; error: string | null }> {
  if (!verifyTrackingToken(orderId, token)) {
    return { data: null, error: 'Invalid tracking token' }
  }

  try {
    const supabaseAdmin = createAdminClient()

    // Check if tenant uses Convex
    const { data: tenantConfig } = await supabaseAdmin
      .from('tenants')
      .select('convex_deployment_url, convex_deploy_key')
      .eq('id', tenantId)
      .eq('is_active', true)
      .single()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = tenantConfig as Record<string, any> | null

    if (!config) {
      return { data: null, error: 'Restaurant not found' }
    }

    let result: TrackingData

    if (config.convex_deployment_url && config.convex_deploy_key) {
      result = await fetchFromConvex(
        config.convex_deployment_url,
        config.convex_deploy_key,
        orderId,
        supabaseAdmin,
        tenantId
      )
    } else {
      result = await fetchFromSupabase(supabaseAdmin, orderId, tenantId)
    }

    // Read after the order, and separately, so the switch can never take the
    // whole tracking page down with it. Both backends get the same answer
    // because the flag lives on the platform tenants row either way.
    const pickupScanEnabled = await fetchPickupScanEnabled(supabaseAdmin, tenantId)

    return { data: { ...result, pickupScanEnabled }, error: null }
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
): Promise<TrackingData> {
  const convex = createConvexServerClient(convexUrl, convexKey)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = await convex.query<any>('orders:getOrderById', { orderId })

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
    createdAt: new Date(order._creationTime).toISOString(),
    isTerminal,
    scheduledLabel: getOrderScheduledLabel({
      scheduled_for: null,
      customer_data: (order.customerData ?? null) as Record<string, unknown> | null,
    }),
  }
}

async function fetchFromSupabase(
  supabase: ReturnType<typeof createAdminClient>,
  orderId: string,
  tenantId: string
): Promise<TrackingData> {
  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      id, status, total, delivery_fee, service_charge_amount, order_type, order_type_id, customer_name, created_at,
      scheduled_for, customer_data,
      order_items(menu_item_name, quantity, price, subtotal, variation, addons)
    `)
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .single()

  if (error || !order) throw new Error('Order not found in Supabase')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = order as any
  const isTerminal = o.status === 'delivered' || o.status === 'cancelled'
  const orderTypeFromRow = await fetchOrderTypeKind(
    supabase,
    o.order_type_id,
    tenantId
  )

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
    createdAt: o.created_at,
    isTerminal,
    scheduledLabel: getOrderScheduledLabel({
      scheduled_for: o.scheduled_for ?? null,
      customer_data: (o.customer_data ?? null) as Record<string, unknown> | null,
    }),
  }
}

/**
 * Server-side order tracking data fetcher.
 * Shared between the SSR page (initial load) and the API route (polling).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createConvexServerClient } from '@/lib/convex/server'
import { verifyTrackingToken } from '@/lib/tracking-token'
import { getOrderScheduledLabel } from '@/lib/advance-order-utils'

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
        orderId
      )
    } else {
      result = await fetchFromSupabase(supabaseAdmin, orderId, tenantId)
    }

    return { data: result, error: null }
  } catch (err) {
    console.error('[Order Tracking] Error:', err instanceof Error ? err.message : err)
    return { data: null, error: 'Order not found' }
  }
}

async function fetchFromConvex(
  convexUrl: string,
  convexKey: string,
  orderId: string
): Promise<TrackingData> {
  const convex = createConvexServerClient(convexUrl, convexKey)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = await convex.query<any>('orders:getOrderById', { orderId })

  if (!order) throw new Error('Order not found in Convex')

  const isTerminal = order.status === 'delivered' || order.status === 'cancelled'

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
      id, status, total, delivery_fee, service_charge_amount, order_type, customer_name, created_at,
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
    customerName: o.customer_name,
    createdAt: o.created_at,
    isTerminal,
    scheduledLabel: getOrderScheduledLabel({
      scheduled_for: o.scheduled_for ?? null,
      customer_data: (o.customer_data ?? null) as Record<string, unknown> | null,
    }),
  }
}

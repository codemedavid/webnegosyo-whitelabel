import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { createConvexServerClient } from '@/lib/convex/server'
import { getTenantSecrets } from '@/lib/tenant-secrets'
import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import { createTenantOrderRealtimeClient } from '@/lib/supabase/tenant-order-client'
import { fetchTenantOrderById } from '@/lib/tenant-supabase-orders-read'

/**
 * The server's own read of an order's status and customer_data.
 *
 * Side effects of a cancellation that runs outside `updateOrderStatus` (the
 * Convex order sheet's stock restore and presell release) must not trust the
 * browser: a caller could name a LIVE order, or hand over invented presell
 * lines. They read the order here instead, from whichever backend
 * `resolveOrderBackend` names — the same resolver checkout writes through.
 *
 * Returns null when the store or the order cannot be found, or when the
 * store's backend cannot be reached; callers treat null as "refuse".
 */

export interface StoredOrderLifecycle {
  status: string
  customerData: unknown
}

const ROUTING_COLUMNS = 'order_backend, convex_deployment_url, supabase_order_url, supabase_order_anon_key'

type AdminClient = ReturnType<typeof createAdminClient>

async function readFromConvex(
  supabase: AdminClient,
  config: OrderBackendTenantFields,
  tenantId: string,
  orderId: string,
): Promise<StoredOrderLifecycle | null> {
  const deployKey = (await getTenantSecrets(supabase, tenantId))?.convex_deploy_key
  if (!config.convex_deployment_url || !deployKey) return null

  const convex = createConvexServerClient(config.convex_deployment_url, deployKey)
  const order = await convex.query<{ status?: string; customerData?: unknown } | null>(
    'orders:getOrderByIdInternal',
    { orderId },
  )
  if (!order || typeof order.status !== 'string') return null
  return { status: order.status, customerData: order.customerData ?? null }
}

async function readFromTenantSupabase(
  config: OrderBackendTenantFields,
  tenantId: string,
  orderId: string,
): Promise<StoredOrderLifecycle | null> {
  const order = await fetchTenantOrderById(createTenantOrderRealtimeClient(config), tenantId, orderId)
  if (!order) return null
  const row = order as unknown as { status: string; customer_data?: unknown }
  return { status: row.status, customerData: row.customer_data ?? null }
}

async function readFromPlatform(
  supabase: AdminClient,
  tenantId: string,
  orderId: string,
): Promise<StoredOrderLifecycle | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('status, customer_data')
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw error
  const row = data as { status: string; customer_data: unknown } | null
  if (!row) return null
  return { status: row.status, customerData: row.customer_data ?? null }
}

export async function readStoredOrderLifecycle(
  tenantId: string,
  orderId: string,
): Promise<StoredOrderLifecycle | null> {
  const supabase = createAdminClient()
  const { data: tenantData, error } = await supabase
    .from('tenants')
    .select(ROUTING_COLUMNS)
    .eq('id', tenantId)
    .maybeSingle()
  if (error) throw error

  const config = tenantData as OrderBackendTenantFields | null
  if (!config) return null

  switch (resolveOrderBackend(config)) {
    case 'convex':
      return readFromConvex(supabase, config, tenantId, orderId)
    case 'supabase':
      return readFromTenantSupabase(config, tenantId, orderId)
    case 'platform':
      return readFromPlatform(supabase, tenantId, orderId)
  }
}

/** Only a cancelled order may have its cancellation side effects replayed. */
export function isCancelledOrder(order: StoredOrderLifecycle | null): order is StoredOrderLifecycle {
  return order?.status === 'cancelled'
}

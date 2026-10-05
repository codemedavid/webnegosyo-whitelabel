/**
 * Today's live order queue for the dashboard's pinned strip — read fresh on
 * every request (never cached) from the store's own order backend.
 *
 * Returns null when the queue cannot be read or the viewer lacks the `orders`
 * permission; the strip then says so instead of showing zeros.
 */

import 'server-only'

import { createConvexServerClient } from '@/lib/convex/server'
import { verifyTenantPermission } from '@/lib/admin-service'
import { getOrderStats } from '@/lib/orders-service'
import { getTenantSupabaseOrderStats } from '@/lib/tenant-order-queue'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantSecrets } from '@/lib/tenant-secrets'
import { hasTenantSupabaseOrderCredentials, resolveOrderBackend } from '@/lib/order-backend'
import type { OrderStats } from '@/lib/order-stats'
import type { Tenant } from '@/types/database'

async function readConvexStats(tenant: Tenant): Promise<OrderStats | null> {
  // Independent reads, issued together; a refused permission still throws
  // before anything is returned.
  const [, secrets] = await Promise.all([
    verifyTenantPermission(tenant.id, 'orders', 'view'),
    getTenantSecrets(createAdminClient(), tenant.id),
  ])
  const url = tenant.convex_deployment_url?.trim()
  const key = secrets?.convex_deploy_key?.trim()
  if (!url || !key) return null
  return createConvexServerClient(url, key).query<OrderStats>('orders:getDashboardStatsInternal', {})
}

export async function readLiveOrderStats(tenant: Tenant): Promise<OrderStats | null> {
  try {
    const backend = resolveOrderBackend(tenant)
    if (backend === 'convex') return await readConvexStats(tenant)
    if (backend === 'supabase') {
      return hasTenantSupabaseOrderCredentials(tenant) ? await getTenantSupabaseOrderStats(tenant) : null
    }
    return await getOrderStats(tenant.id)
  } catch (error) {
    console.error('[dashboard] live order stats unavailable', error)
    return null
  }
}

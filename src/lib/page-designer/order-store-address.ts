// Server: the address behind a tracking page's `{store_address}`. Read once per
// page load (never on the status poll), and only for a design that prints it.

import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import { fetchOrderTrackingContext } from '@/lib/order-tracking-service'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Tenant } from '@/types/database'

import { storeAddressToken } from './store-address'

export function designUsesStoreAddress(design: HeroDesignV5): boolean {
  return /\{store_address\}/i.test(JSON.stringify(design.sections))
}

/**
 * The address of the branch that took this order, else the store's. A failed
 * read falls back to the store: the token is a convenience, the tracking page
 * must still open. The tracking token proved the order; the branch is matched
 * to this tenant so an order can only ever print its own store's address.
 */
export async function readOrderStoreAddress(tenant: Pick<Tenant, 'id' | 'restaurant_address'>, orderId: string, token: string): Promise<string> {
  const fallback = storeAddressToken(tenant, null)
  try {
    const { data: order } = await fetchOrderTrackingContext(orderId, token, tenant.id)
    const outletId = order?.loyaltyIdentity.outletId
    if (!outletId) return fallback
    const { data: branch, error } = await createAdminClient()
      .from('outlets')
      .select('address')
      .eq('id', outletId)
      .eq('tenant_id', tenant.id)
      .maybeSingle()
    if (error) throw error
    return storeAddressToken(tenant, branch)
  } catch (err) {
    console.error('[Order Tracking] Branch address unavailable:', err instanceof Error ? err.message : err)
    return fallback
  }
}

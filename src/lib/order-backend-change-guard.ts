import type { SupabaseClient } from '@supabase/supabase-js'
import {
  previewBackendChange,
  type BackendSaveInput,
  type OrderBackendTenantFields,
} from '@/lib/order-backend'

/**
 * Changing where a store's orders live does not move the orders already
 * written: they stay on the old backend, out of every list, report and void
 * the store now reads. So a save that would change the RESOLVED backend is
 * refused for a store that has orders or stock claims there, unless the
 * superadmin sends `confirm_backend_change`.
 *
 * Platform orders and claims are counted here. A store leaving Convex (or its
 * own Supabase project) cannot have its orders counted from this database, so
 * it is always asked to confirm. A check that fails also asks, never guesses.
 */
export const BACKEND_CHANGE_REFUSAL =
  'This change moves where orders are stored, and the existing orders stay behind on the current backend. ' +
  'Re-save with confirm_backend_change to proceed.'

type Reader = Pick<SupabaseClient, 'from'>

async function hasRows(supabase: Reader, table: 'orders' | 'order_stock_applications', tenantId: string): Promise<boolean> {
  const { data, error } = await supabase.from(table).select('id').eq('tenant_id', tenantId).limit(1)
  if (error) throw error
  return (data?.length ?? 0) > 0
}

export async function refuseUnconfirmedBackendChange(args: {
  supabase: Reader
  tenantId: string
  current: OrderBackendTenantFields
  input: BackendSaveInput
  confirmed: boolean | undefined
}): Promise<string | null> {
  const change = previewBackendChange(args.current, args.input)
  if (!change || args.confirmed === true) return null
  if (change.from !== 'platform') return BACKEND_CHANGE_REFUSAL

  try {
    const [hasOrders, hasClaims] = await Promise.all([
      hasRows(args.supabase, 'orders', args.tenantId),
      hasRows(args.supabase, 'order_stock_applications', args.tenantId),
    ])
    return hasOrders || hasClaims ? BACKEND_CHANGE_REFUSAL : null
  } catch (error) {
    console.error('[tenants] Could not check a store for orders before a backend change', args.tenantId, error)
    return BACKEND_CHANGE_REFUSAL
  }
}

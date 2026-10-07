/**
 * Read what the launch checklist needs for one store. Service-role reads,
 * called only after the caller was verified as an admin of the store: RLS
 * refusals are silent (zero rows), and a checklist that silently read zero
 * would tell a ready merchant they have no menu.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { LaunchSnapshot } from './readiness'

type AdminClient = SupabaseClient<Database>

async function countRows(query: PromiseLike<{ count: number | null; error: { message: string } | null }>, what: string): Promise<number> {
  const { count, error } = await query
  if (error) throw new Error(`${what} could not be counted: ${error.message}`)
  return count ?? 0
}

export interface LaunchTenantFields {
  id: string
  logo_url?: string | null
  messenger_page_id?: string | null
  messenger_username?: string | null
  facebook_page_id?: string | null
  operating_hours?: unknown
  loyalty_enabled?: boolean | null
  loyalty_shadow?: boolean | null
}

export async function loadLaunchSnapshot(admin: AdminClient, tenant: LaunchTenantFields): Promise<LaunchSnapshot> {
  const head = { count: 'exact' as const, head: true }
  const [menuItemCount, paymentMethodCount, enabledOrderTypeCount, bundleCount, pairCount, activeProgramCount] = await Promise.all([
    countRows(admin.from('menu_items').select('id', head).eq('tenant_id', tenant.id), 'Menu items'),
    countRows(admin.from('payment_methods').select('id', head).eq('tenant_id', tenant.id).eq('is_active', true), 'Payment methods'),
    countRows(admin.from('order_types').select('id', head).eq('tenant_id', tenant.id).eq('is_enabled', true), 'Order types'),
    countRows(admin.from('bundles').select('id', head).eq('tenant_id', tenant.id).eq('is_active', true), 'Combos'),
    countRows(admin.from('upsell_pairs').select('id', head).eq('tenant_id', tenant.id).eq('is_active', true), 'Upsells'),
    countRows(admin.from('loyalty_programs').select('id', head).eq('tenant_id', tenant.id).eq('status', 'active'), 'Loyalty programs'),
  ])

  const hours = tenant.operating_hours
  return {
    menuItemCount,
    paymentMethodCount,
    enabledOrderTypeCount,
    hasLogo: !!tenant.logo_url,
    hasMessenger: !!(tenant.facebook_page_id || tenant.messenger_page_id || tenant.messenger_username),
    hasHours: !!hours && typeof hours === 'object' && Object.keys(hours as object).length > 0,
    isLoyaltyLive: activeProgramCount > 0 && tenant.loyalty_enabled === true && tenant.loyalty_shadow !== true,
    boostOfferCount: bundleCount + pairCount,
  }
}

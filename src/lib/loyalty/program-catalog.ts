import type { SupabaseClient } from '@supabase/supabase-js'
import type { LoyaltyRules } from './types'

/** Catalog IDs and names are authoritative even when orders use another backend. */
export async function validateProgramCatalog(
  client: SupabaseClient,
  tenantId: string,
  rules: LoyaltyRules,
): Promise<string | null> {
  if (rules.reward.type !== 'free_item') return null
  const { data, error } = await client
    .from('menu_items')
    .select('id, name, is_available, presell_enabled')
    .eq('tenant_id', tenantId)
    .eq('id', rules.reward.menuItemId)
    .maybeSingle()
  if (error) throw new Error('Catalog could not be loaded.')
  if (!data || !data.is_available)
    return 'Choose an available menu item from this store.'
  if (data.presell_enabled)
    return 'Choose a regular item for the free-item reward.'
  rules.reward = { type: 'free_item', menuItemId: data.id, itemName: data.name }
  return null
}

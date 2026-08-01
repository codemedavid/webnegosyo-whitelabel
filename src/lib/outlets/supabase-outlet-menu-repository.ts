/**
 * The `OutletMenuRepository` backed by the platform Supabase database, beside
 * `menu_items` and `outlets` themselves.
 *
 * Deliberately thin, like `supabase-outlet-repository.ts`: the merge and every
 * rule come from `outlet-menu-repository.ts`, so this file only translates the
 * interface into PostgREST calls. Reads go through the RLS-enforcing server
 * client — the branch-scoped write policy from the migration is the boundary,
 * and using the service-role client here would step around it.
 *
 * Read failures throw rather than resolving to "no overrides". An empty result
 * means "every branch sells at the store-wide price", which is a specific and
 * wrong claim to make on a failed query — it would quote one branch's customers
 * another branch's prices.
 */

import { createClient } from '@/lib/supabase/server'
import {
  INHERITED_OVERRIDE,
  mergeOutletMenuOverride,
  overridesNothing,
  OUTLET_MENU_OVERRIDE_SELECT,
  type OutletMenuOverride,
  type OutletMenuOverridePatch,
  type OutletMenuOverrideValues,
  type OutletMenuRepository,
} from '@/lib/outlets/outlet-menu-repository'

function valuesOf(row: OutletMenuOverride | null): OutletMenuOverrideValues {
  if (!row) return { ...INHERITED_OVERRIDE }
  return {
    is_listed: row.is_listed,
    is_available: row.is_available,
    price: row.price,
    discounted_price: row.discounted_price,
    discount_cleared: row.discount_cleared,
  }
}

export function createSupabaseOutletMenuRepository(): OutletMenuRepository {
  async function findRow(
    tenantId: string,
    outletId: string,
    menuItemId: string
  ): Promise<OutletMenuOverride | null> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('outlet_menu_items')
      .select(OUTLET_MENU_OVERRIDE_SELECT)
      .eq('tenant_id', tenantId)
      .eq('outlet_id', outletId)
      .eq('menu_item_id', menuItemId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    return (data as unknown as OutletMenuOverride) ?? null
  }

  return {
    async listByTenant(tenantId) {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('outlet_menu_items')
        .select(OUTLET_MENU_OVERRIDE_SELECT)
        .eq('tenant_id', tenantId)

      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as OutletMenuOverride[]
    },

    async listByOutlet(tenantId, outletId) {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('outlet_menu_items')
        .select(OUTLET_MENU_OVERRIDE_SELECT)
        .eq('tenant_id', tenantId)
        .eq('outlet_id', outletId)

      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as OutletMenuOverride[]
    },

    async listByMenuItem(tenantId, menuItemId) {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('outlet_menu_items')
        .select(OUTLET_MENU_OVERRIDE_SELECT)
        .eq('tenant_id', tenantId)
        .eq('menu_item_id', menuItemId)

      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as OutletMenuOverride[]
    },

    async save(tenantId, outletId, menuItemId, patch: OutletMenuOverridePatch) {
      // Read-then-merge rather than a bare upsert: the patch is partial, and a
      // PostgREST upsert of a partial row would reset every column the merchant
      // did not mention back to its default — silently un-86'ing a dish while
      // they were editing its price.
      const existing = await findRow(tenantId, outletId, menuItemId)
      const merged = mergeOutletMenuOverride(valuesOf(existing), patch)

      if (overridesNothing(merged)) {
        await this.clear(tenantId, outletId, menuItemId)
        return null
      }

      const supabase = await createClient()
      const { data, error } = await supabase
        .from('outlet_menu_items')
        .upsert(
          {
            tenant_id: tenantId,
            outlet_id: outletId,
            menu_item_id: menuItemId,
            ...merged,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: 'outlet_id,menu_item_id' }
        )
        .select(OUTLET_MENU_OVERRIDE_SELECT)
        .single()

      if (error) throw new Error(error.message)
      return data as unknown as OutletMenuOverride
    },

    async clear(tenantId, outletId, menuItemId) {
      const supabase = await createClient()
      const { error } = await supabase
        .from('outlet_menu_items')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('outlet_id', outletId)
        .eq('menu_item_id', menuItemId)

      if (error) throw new Error(error.message)
    },
  }
}

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
import { NOTHING_CHANGED_MESSAGE } from '@/platform/db/assert-rows-changed'
import { assertRowsChangedOrGone } from '@/platform/db/assert-rows-changed-or-gone'
import { readAllRows, type PageQuery } from '@/platform/db/read-all-rows'
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

/**
 * The most branch differences one list read returns. A store's rows are
 * dishes x branches-that-differ, so this is far above any real store; past it
 * the read fails rather than answer with part of the rows.
 */
const MAX_BRANCH_MENU_ROWS = 20_000

/**
 * Every row of a list read. One response carries at most 1,000 rows and says
 * nothing about the rest, and a difference that was not read is the claim
 * "this branch sells it at the store-wide price", so the read is paged. Each
 * caller ends its query with a unique order ((outlet_id, menu_item_id) is
 * unique), which is what keeps a row from landing on two pages or on none.
 */
async function readEveryOverride(query: PageQuery<OutletMenuOverride>): Promise<OutletMenuOverride[]> {
  const result = await readAllRows(query, { maxRows: MAX_BRANCH_MENU_ROWS })
  if (result.ok) return result.rows
  if (result.reason === 'error') throw new Error(result.error.message)
  throw new Error('This store has more than 20,000 branch menu differences, too many to load at once.')
}

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
      return readEveryOverride(
        (from, to) =>
          supabase
            .from('outlet_menu_items')
            .select(OUTLET_MENU_OVERRIDE_SELECT)
            .eq('tenant_id', tenantId)
            .order('outlet_id', { ascending: true })
            .order('menu_item_id', { ascending: true })
            .range(from, to) as unknown as ReturnType<PageQuery<OutletMenuOverride>>,
      )
    },

    async listByOutlet(tenantId, outletId) {
      const supabase = await createClient()
      return readEveryOverride(
        (from, to) =>
          supabase
            .from('outlet_menu_items')
            .select(OUTLET_MENU_OVERRIDE_SELECT)
            .eq('tenant_id', tenantId)
            .eq('outlet_id', outletId)
            // One row per dish per branch, so within a branch this order is unique.
            .order('menu_item_id', { ascending: true })
            .range(from, to) as unknown as ReturnType<PageQuery<OutletMenuOverride>>,
      )
    },

    async listByMenuItem(tenantId, menuItemId) {
      const supabase = await createClient()
      return readEveryOverride(
        (from, to) =>
          supabase
            .from('outlet_menu_items')
            .select(OUTLET_MENU_OVERRIDE_SELECT)
            .eq('tenant_id', tenantId)
            .eq('menu_item_id', menuItemId)
            // One row per branch per dish, so for one dish this order is unique.
            .order('outlet_id', { ascending: true })
            .range(from, to) as unknown as ReturnType<PageQuery<OutletMenuOverride>>,
      )
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
      // No row is the usual case (the branch never differed, or `save` merged
      // back to nothing). A row still there after a zero-row delete was kept by
      // row-level security: the dish is still different at that branch.
      const result = await assertRowsChangedOrGone(
        await supabase
          .from('outlet_menu_items')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('outlet_id', outletId)
          .eq('menu_item_id', menuItemId)
          .select('menu_item_id'),
        () =>
          supabase
            .from('outlet_menu_items')
            .select('menu_item_id')
            .eq('tenant_id', tenantId)
            .eq('outlet_id', outletId)
            .eq('menu_item_id', menuItemId)
            .limit(1),
      )
      if (!result.ok) throw new Error(result.reason === 'error' ? result.error.message : NOTHING_CHANGED_MESSAGE)
    },
  }
}

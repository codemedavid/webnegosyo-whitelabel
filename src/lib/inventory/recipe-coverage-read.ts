/**
 * Reading recipe coverage for the inventory page.
 *
 * Runs for an admin looking at their own inventory, so it goes through the
 * RLS-enforcing server client like every other admin read — not the
 * service-role client the order-driven write path needs.
 *
 * The rules live in `recipe-coverage.ts`; this only fetches what they need.
 */

import { createClient } from '@/lib/supabase/server'
import { buildRecipeCoverage, type RecipeCoverageRow } from '@/lib/inventory/recipe-coverage'
import type { MenuItem, Recipe, RecipeComponent } from '@/types/database'

export interface RecipeCoverageResult {
  coverageRows: RecipeCoverageRow[]
  /** Every component, so "which ingredients are unused?" can be answered too. */
  recipeComponents: RecipeComponent[]
}

const NOTHING: RecipeCoverageResult = { coverageRows: [], recipeComponents: [] }

/**
 * Coverage for every dish on one tenant's menu.
 *
 * Returns empty rather than throwing: this renders inside the inventory page,
 * and a failed coverage read must not take ingredients and units down with it.
 */
export async function getRecipeCoverage(tenantId: string): Promise<RecipeCoverageResult> {
  try {
    const supabase = await createClient()

    const [menuItemsResult, recipesResult, componentsResult] = await Promise.all([
      supabase.from('menu_items').select('id, name').eq('tenant_id', tenantId),
      supabase.from('recipes').select('id, target_type, menu_item_id').eq('tenant_id', tenantId),
      supabase.from('recipe_components').select('recipe_id, inventory_item_id').eq('tenant_id', tenantId),
    ])

    const components = (componentsResult.data ?? []) as unknown as RecipeComponent[]

    return {
      coverageRows: buildRecipeCoverage(
        (menuItemsResult.data ?? []) as unknown as MenuItem[],
        (recipesResult.data ?? []) as unknown as Recipe[],
        components,
      ),
      recipeComponents: components,
    }
  } catch (error) {
    console.error('[inventory] Failed to read recipe coverage', tenantId, error)
    return NOTHING
  }
}

/**
 * Server-side service layer for per-tenant recipes (bill of materials) and
 * their ingredient components.
 *
 * A recipe is addressed by a `RecipeTarget` (see `recipe-target.ts`), which the
 * pure `buildRecipeTargetColumns` maps to the exact `recipes` columns — the same
 * mapping is used both to locate an existing recipe and to insert a new one, so
 * a modifier option's recipe is always keyed by `modifier_option_id`.
 *
 * `saveRecipeForTarget` is an upsert: it creates the recipe row if absent, then
 * replaces its component lines wholesale (delete-then-insert) so the caller can
 * treat the component list as the desired end state.
 */

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { verifyTenantPermission } from '@/lib/admin-service'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import type { Recipe, RecipeComponent } from '@/types/database'
import { buildRecipeTargetColumns, type RecipeTarget } from '@/lib/inventory/recipe-target'
import { buildRecipeRowFields } from '@/lib/inventory/recipe-yield'
import {
  recipeComponentInputSchema,
  recipeInputSchema,
  type RecipeComponentInput,
  type RecipeInput,
} from '@/lib/inventory/schemas'

export { recipeComponentInputSchema, recipeInputSchema, type RecipeComponentInput, type RecipeInput }

export interface RecipeWithComponents {
  recipe: Recipe
  components: RecipeComponent[]
}

// Applies the target's non-null id columns as equality filters. Because the
// null columns differ per target and target_type is always included, matching
// on target_type + the populated ids uniquely identifies the recipe.
function applyTargetFilter(
  query: ReturnType<ReturnType<Awaited<ReturnType<typeof createClient>>['from']>['select']>,
  target: RecipeTarget,
) {
  const cols = buildRecipeTargetColumns(target)
  let q = query.eq('target_type', cols.target_type)
  if (cols.menu_item_id) q = q.eq('menu_item_id', cols.menu_item_id)
  if (cols.variation_option_id) q = q.eq('variation_option_id', cols.variation_option_id)
  if (cols.addon_id) q = q.eq('addon_id', cols.addon_id)
  if (cols.modifier_option_id) q = q.eq('modifier_option_id', cols.modifier_option_id)
  if (cols.prep_item_id) q = q.eq('prep_item_id', cols.prep_item_id)
  return q
}

/** All recipes for a menu item (base + its option/addon/modifier recipes). */
export const getRecipesForMenuItem = cache(
  async (tenantId: string, menuItemId: string): Promise<Recipe[]> => {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('menu_item_id', menuItemId)

    if (error) throw error
    return (data ?? []) as unknown as Recipe[]
  },
)

/** The recipe (with components) for a single target, or null if none exists. */
export async function getRecipeForTarget(
  tenantId: string,
  target: RecipeTarget,
): Promise<RecipeWithComponents | null> {
  const supabase = await createClient()

  const { data: recipeRow, error } = await applyTargetFilter(
    supabase.from('recipes').select('*').eq('tenant_id', tenantId),
    target,
  ).maybeSingle()

  if (error) throw error
  if (!recipeRow) return null

  const recipe = recipeRow as unknown as Recipe
  const { data: components, error: componentsError } = await supabase
    .from('recipe_components')
    .select('*')
    .eq('recipe_id', recipe.id)
    .order('sort_order', { ascending: true })

  if (componentsError) throw componentsError
  return { recipe, components: (components ?? []) as unknown as RecipeComponent[] }
}

/**
 * Upsert a recipe for a target and replace its components. Passing an empty
 * component list with no existing recipe is a no-op that returns null.
 */
export async function saveRecipeForTarget(
  tenantId: string,
  target: RecipeTarget,
  input: RecipeInput,
  ctx?: ProvisioningCtx,
): Promise<RecipeWithComponents | null> {
  if (!ctx) await verifyTenantPermission(tenantId, 'menu')
  const validated = recipeInputSchema.parse(input)
  const supabase = ctx?.client ?? (await createClient())
  const cols = buildRecipeTargetColumns(target)

  // Find or create the recipe row.
  const { data: existing, error: findError } = await applyTargetFilter(
    supabase.from('recipes').select('*').eq('tenant_id', tenantId),
    target,
  ).maybeSingle()
  if (findError) throw findError

  let recipe = existing as unknown as Recipe | null

  const rowFields = buildRecipeRowFields(validated)

  if (!recipe) {
    if (validated.components.length === 0) return null
    const { data: created, error: insertError } = await supabase
      .from('recipes')
      .insert({ tenant_id: tenantId, ...rowFields, ...cols } as never)
      .select()
      .single()
    if (insertError) throw insertError
    recipe = created as unknown as Recipe
  } else {
    const { error: updateError } = await supabase
      .from('recipes')
      .update({ ...rowFields, updated_at: new Date().toISOString() } as never)
      .eq('id', recipe.id)
      .eq('tenant_id', tenantId)
    if (updateError) throw updateError
  }

  // Replace components wholesale (delete-then-insert).
  const { error: deleteError } = await supabase
    .from('recipe_components')
    .delete()
    .eq('recipe_id', recipe.id)
    .eq('tenant_id', tenantId)
  if (deleteError) throw deleteError

  if (validated.components.length === 0) {
    return { recipe, components: [] }
  }

  const rows = validated.components.map((component, index) => ({
    tenant_id: tenantId,
    recipe_id: recipe!.id,
    inventory_item_id: component.inventory_item_id,
    quantity: component.quantity,
    unit_id: component.unit_id,
    sort_order: index,
  }))
  const { data: inserted, error: componentsError } = await supabase
    .from('recipe_components')
    .insert(rows as never)
    .select()
  if (componentsError) throw componentsError

  return { recipe, components: (inserted ?? []) as unknown as RecipeComponent[] }
}

/** Remove a target's recipe (components cascade via FK). No-op if absent. */
export async function deleteRecipeForTarget(
  tenantId: string,
  target: RecipeTarget,
): Promise<void> {
  await verifyTenantPermission(tenantId, 'menu')
  const supabase = await createClient()

  const { error } = await applyTargetFilter(
    supabase.from('recipes').delete().eq('tenant_id', tenantId) as never,
    target,
  )
  if (error) throw error
}

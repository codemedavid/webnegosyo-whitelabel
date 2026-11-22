/**
 * Server side of the dish recipe table: read a dish's recipes with their
 * version, save them all at once through `save_dish_recipes` (one
 * transaction, compare-and-set, RLS as the caller —
 * 20261122120000_save_dish_recipes.sql).
 *
 * Everything reads and writes through the caller's cookie-session client, so
 * the recipes RLS (menu on a store-wide account) is the boundary, the same as
 * the per-recipe writer. Inventory is always platform-side (CLAUDE.md), so
 * there is no other backend to route to.
 */

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getIngredients } from '@/lib/inventory/ingredients-service'
import { getUnits } from '@/lib/inventory/units-service'
import { recipeLineRejection } from '@/lib/inventory/recipe-line-rules'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'
import type { ModifierSource } from '@/lib/modifier-groups'
import {
  changedTargets,
  dishRecipeGroups,
  optionIndex,
  type DishRecipeGroup,
  type DishRecipes,
} from '@/lib/inventory/dish-recipe/model'
import { changesToPayload, recipesFromRows, type RecipeComponentRow, type RecipeRow } from '@/lib/inventory/dish-recipe/rows'
import { findStoredProblem } from '@/lib/inventory/dish-recipe/validate'

/** A save the database refused because someone else saved first. */
export const DISH_RECIPES_STALE = 'DishRecipesStale'

export interface DishRecipeSnapshot {
  menuItemId: string
  dishName: string
  groups: DishRecipeGroup[]
  recipes: DishRecipes
  /** The compare-and-set token to send back with the save. */
  version: string
}

/** Recipe rows per dish stay small; a dish past this is refused rather than half-read. */
const MAX_RECIPES_PER_DISH = 900

type SessionClient = Awaited<ReturnType<typeof createClient>>

async function readVersion(supabase: SessionClient, tenantId: string, menuItemId: string): Promise<string> {
  const { data, error } = await supabase.rpc('dish_recipes_version' as never, {
    p_tenant_id: tenantId,
    p_menu_item_id: menuItemId,
  } as never)
  if (error) throw error
  return String(data ?? '')
}

export async function loadDishRecipes(
  tenantId: string,
  menuItemId: string,
  client?: SessionClient,
): Promise<DishRecipeSnapshot> {
  const supabase = client ?? (await createClient())
  const { data: item, error: itemError } = await supabase
    .from('menu_items')
    .select('id, name, modifier_groups, variation_types, variations, addons')
    .eq('tenant_id', tenantId)
    .eq('id', menuItemId)
    .maybeSingle()
  if (itemError) throw itemError
  if (!item) throw new Error('Not found: dish')

  const { data: recipeRows, error: recipesError } = await supabase
    .from('recipes')
    .select('id, target_type, modifier_option_id, variation_option_id, addon_id')
    .eq('tenant_id', tenantId)
    .eq('menu_item_id', menuItemId)
    .neq('target_type', 'prep_item')
    .limit(MAX_RECIPES_PER_DISH + 1)
  if (recipesError) throw recipesError
  const recipes = (recipeRows ?? []) as unknown as RecipeRow[]
  if (recipes.length > MAX_RECIPES_PER_DISH) throw new Error('This dish has too many recipes to show at once')

  let components: RecipeComponentRow[] = []
  if (recipes.length > 0) {
    const { data, error } = await supabase
      .from('recipe_components')
      .select('recipe_id, inventory_item_id, quantity, unit_id, sort_order')
      .eq('tenant_id', tenantId)
      .in('recipe_id', recipes.map((recipe) => recipe.id))
      .order('sort_order')
      .range(0, 999)
    if (error) throw error
    components = (data ?? []) as unknown as RecipeComponentRow[]
    if (components.length >= 1000) throw new Error('This dish has too many recipe lines to show at once')
  }

  const groups = dishRecipeGroups(item as unknown as ModifierSource)
  return {
    menuItemId,
    dishName: (item as { name?: string }).name ?? '',
    groups,
    recipes: recipesFromRows(groups, recipes, components),
    version: await readVersion(supabase, tenantId, menuItemId),
  }
}

const lineSchema = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: z.number().finite().positive().max(1_000_000),
  unitId: z.string().uuid(),
})

export const dishRecipesInputSchema = z.object({
  base: z.array(lineSchema).max(100),
  options: z.record(z.string().trim().min(1).max(200), z.array(lineSchema).max(100)),
})

export interface SaveDishRecipesResult {
  snapshot: DishRecipeSnapshot
  /** How many recipes the save wrote (0 = nothing had changed). */
  written: number
}

/**
 * Save what the owner's table means. The dish's choices are re-read here, so
 * a choice id the dish no longer has is refused and each choice is written
 * under its own recipe kind — the browser never decides either.
 */
export async function saveDishRecipes(
  tenantId: string,
  menuItemId: string,
  expectedVersion: string,
  input: unknown,
): Promise<SaveDishRecipesResult> {
  const next = dishRecipesInputSchema.parse(input)
  const supabase = await createClient()
  const current = await loadDishRecipes(tenantId, menuItemId, supabase)
  if (current.version !== expectedVersion) {
    const error = new Error('These recipes were changed on another screen. Reload to see the latest, then save again.')
    error.name = DISH_RECIPES_STALE
    throw error
  }

  const known = optionIndex(current.groups)
  const unknown = Object.keys(next.options).filter((optionId) => !known.has(optionId))
  if (unknown.length > 0) {
    throw recipeLineRejection('One of these choices is no longer on the dish. Reload and try again.')
  }

  const [ingredients, units] = await Promise.all([getIngredients(tenantId), getUnits(tenantId)])
  const problem = findStoredProblem(
    next,
    new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
    units as unknown as InventoryUnit[],
  )
  if (problem) throw recipeLineRejection(problem)

  const payload = changesToPayload(current.groups, changedTargets(current.recipes, next))
  if (payload.length === 0) return { snapshot: current, written: 0 }

  const { error } = await supabase.rpc('save_dish_recipes' as never, {
    p_tenant_id: tenantId,
    p_menu_item_id: menuItemId,
    p_expected_version: expectedVersion,
    p_targets: payload,
  } as never)
  if (error) {
    if (error.code === '40001') {
      const stale = new Error(error.message)
      stale.name = DISH_RECIPES_STALE
      throw stale
    }
    if (error.code === '42501') throw new Error(`Forbidden: ${error.message}`)
    if (error.code === '22023' || error.code === 'P0001') throw recipeLineRejection(error.message)
    throw error
  }

  return { snapshot: await loadDishRecipes(tenantId, menuItemId, supabase), written: payload.length }
}

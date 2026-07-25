'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  getUnits,
  seedDefaultUnits,
  createUnit,
  updateUnit,
  deleteUnit,
  type UnitInput,
} from '@/lib/inventory/units-service'
import {
  getIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
  type IngredientInput,
} from '@/lib/inventory/ingredients-service'
import {
  getRecipeForTarget,
  saveRecipeForTarget,
  deleteRecipeForTarget,
  type RecipeInput,
} from '@/lib/inventory/recipes-service'
import { getMenuItemCost } from '@/lib/inventory/costing-service'
import type { RecipeTarget } from '@/lib/inventory/recipe-target'

function zodErrorMessage(error: z.ZodError): string {
  return JSON.stringify(error.issues.map((err) => ({ path: err.path, message: err.message })))
}

function fail(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return { success: false as const, error: zodErrorMessage(error) }
  return { success: false as const, error: error instanceof Error ? error.message : fallback }
}

const inventoryPath = (slug: string) => `/${slug}/admin/inventory`

// ============================================
// Units
// ============================================

export async function getInventoryUnitsAction(tenantId: string) {
  try {
    return { success: true as const, data: await getUnits(tenantId) }
  } catch (error) {
    return fail(error, 'Failed to fetch units')
  }
}

export async function seedInventoryUnitsAction(tenantId: string, tenantSlug: string) {
  try {
    const data = await seedDefaultUnits(tenantId)
    revalidatePath(inventoryPath(tenantSlug))
    return { success: true as const, data }
  } catch (error) {
    return fail(error, 'Failed to seed units')
  }
}

export async function createInventoryUnitAction(
  tenantId: string,
  tenantSlug: string,
  input: UnitInput,
) {
  try {
    const data = await createUnit(tenantId, input)
    revalidatePath(inventoryPath(tenantSlug))
    return { success: true as const, data }
  } catch (error) {
    return fail(error, 'Failed to create unit')
  }
}

export async function updateInventoryUnitAction(
  unitId: string,
  tenantId: string,
  tenantSlug: string,
  input: UnitInput,
) {
  try {
    const data = await updateUnit(unitId, tenantId, input)
    revalidatePath(inventoryPath(tenantSlug))
    return { success: true as const, data }
  } catch (error) {
    return fail(error, 'Failed to update unit')
  }
}

export async function deleteInventoryUnitAction(unitId: string, tenantId: string, tenantSlug: string) {
  try {
    await deleteUnit(unitId, tenantId)
    revalidatePath(inventoryPath(tenantSlug))
    return { success: true as const }
  } catch (error) {
    return fail(error, 'Failed to delete unit')
  }
}

// ============================================
// Ingredients
// ============================================

export async function getIngredientsAction(tenantId: string) {
  try {
    return { success: true as const, data: await getIngredients(tenantId) }
  } catch (error) {
    return fail(error, 'Failed to fetch ingredients')
  }
}

export async function createIngredientAction(
  tenantId: string,
  tenantSlug: string,
  input: IngredientInput,
) {
  try {
    const data = await createIngredient(tenantId, input)
    revalidatePath(inventoryPath(tenantSlug))
    return { success: true as const, data }
  } catch (error) {
    return fail(error, 'Failed to create ingredient')
  }
}

export async function updateIngredientAction(
  ingredientId: string,
  tenantId: string,
  tenantSlug: string,
  input: IngredientInput,
) {
  try {
    const data = await updateIngredient(ingredientId, tenantId, input)
    revalidatePath(inventoryPath(tenantSlug))
    return { success: true as const, data }
  } catch (error) {
    return fail(error, 'Failed to update ingredient')
  }
}

export async function deleteIngredientAction(
  ingredientId: string,
  tenantId: string,
  tenantSlug: string,
) {
  try {
    await deleteIngredient(ingredientId, tenantId)
    revalidatePath(inventoryPath(tenantSlug))
    return { success: true as const }
  } catch (error) {
    return fail(error, 'Failed to delete ingredient')
  }
}

// ============================================
// Recipes (keyed by target — incl. modifier options)
// ============================================

/**
 * Recipe-derived cost of every costable target on one menu item, for the live
 * margin display in the product editor.
 */
export async function getMenuItemCostAction(tenantId: string, menuItemId: string) {
  try {
    return { success: true as const, data: await getMenuItemCost(tenantId, menuItemId) }
  } catch (error) {
    return fail(error, 'Failed to compute menu item cost')
  }
}

export async function getRecipeForTargetAction(tenantId: string, target: RecipeTarget) {
  try {
    return { success: true as const, data: await getRecipeForTarget(tenantId, target) }
  } catch (error) {
    return fail(error, 'Failed to fetch recipe')
  }
}

export async function saveRecipeForTargetAction(
  tenantId: string,
  tenantSlug: string,
  target: RecipeTarget,
  input: RecipeInput,
) {
  try {
    const data = await saveRecipeForTarget(tenantId, target, input)
    revalidatePath(inventoryPath(tenantSlug))
    return { success: true as const, data }
  } catch (error) {
    return fail(error, 'Failed to save recipe')
  }
}

export async function deleteRecipeForTargetAction(
  tenantId: string,
  tenantSlug: string,
  target: RecipeTarget,
) {
  try {
    await deleteRecipeForTarget(tenantId, target)
    revalidatePath(inventoryPath(tenantSlug))
    return { success: true as const }
  } catch (error) {
    return fail(error, 'Failed to delete recipe')
  }
}

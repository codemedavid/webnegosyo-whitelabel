/**
 * Deleting an ingredient — what `delete_inventory_item` decided, in words.
 *
 * The database decides (see the migration): the ingredient's recipe lines are
 * removed, and one with stock history is archived (`is_active = false`, shown
 * as "Not in use") rather than deleted, so its ledger survives. Everything
 * here only reads that decision; nothing here decides.
 */

import { z } from 'zod'
import type { InventoryItem } from '@/types/database'

const impactSchema = z.object({
  outcome: z.enum(['deleted', 'archived']),
  recipe_count: z.number().int().nonnegative(),
  recipe_lines_removed: z.number().int().nonnegative(),
})

export type IngredientDeleteOutcome = z.infer<typeof impactSchema>['outcome']

export interface IngredientDeleteImpact {
  outcome: IngredientDeleteOutcome
  recipeCount: number
  recipeLinesRemoved: number
}

/** Throws on a payload it does not understand — never guesses an outcome. */
export function parseIngredientDeleteImpact(data: unknown): IngredientDeleteImpact {
  const parsed = impactSchema.parse(data)
  return {
    outcome: parsed.outcome,
    recipeCount: parsed.recipe_count,
    recipeLinesRemoved: parsed.recipe_lines_removed,
  }
}

const recipes = (count: number) => `${count} recipe${count === 1 ? '' : 's'}`

/** The confirm text: what WILL happen, read from a dry run. */
export function describeIngredientDelete(name: string, impact: IngredientDeleteImpact): string {
  const lines = [`Delete ${name}?`]
  if (impact.recipeCount > 0) {
    const uses = impact.recipeCount === 1 ? 'uses' : 'use'
    lines.push(`${recipes(impact.recipeCount)} ${uses} it. It will be removed from them, and their cost changes.`)
  }
  if (impact.outcome === 'archived') {
    lines.push(`${name} has stock history, so it will be kept as "Not in use" instead of erased. Its history is kept.`)
  }
  return lines.join('\n\n')
}

/** The toast: what DID happen. */
export function describeIngredientDeleteOutcome(name: string, impact: IngredientDeleteImpact): string {
  const removed = impact.recipeLinesRemoved > 0 ? ` Removed from ${recipes(impact.recipeCount)}.` : ''
  if (impact.outcome === 'archived') {
    return `${name} marked Not in use — its stock history is kept.${removed}`
  }
  return `${name} deleted`
}

/** The list after the outcome: a deleted row leaves, an archived one switches off. */
export function applyIngredientDeleteOutcome(
  ingredients: readonly InventoryItem[],
  ingredientId: string,
  outcome: IngredientDeleteOutcome,
): InventoryItem[] {
  if (outcome === 'deleted') return ingredients.filter((item) => item.id !== ingredientId)
  return ingredients.map((item) => (item.id === ingredientId ? { ...item, is_active: false } : item))
}

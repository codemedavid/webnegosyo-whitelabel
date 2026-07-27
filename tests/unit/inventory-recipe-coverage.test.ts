/**
 * Phase A — showing a merchant which dishes still have no recipe.
 *
 * Recipes are the gate on the entire inventory feature: no recipe means no
 * depletion, so no alert, no auto-86, and a stock figure that never moves. The
 * one tenant live on inventory proves how easily that stalls — flag on, one
 * ingredient created, zero recipes, nothing has ever depleted.
 *
 * The cause is that a recipe can only be reached one dish at a time, buried at
 * the bottom of the menu-item form. Nothing anywhere answers "which of my
 * dishes are set up?" or "is this ingredient actually used by anything?".
 *
 * Pure, like `low-stock.ts` and `menu-availability.ts` — the web tab and, later,
 * the merchant app both need this answer and must not compute it differently.
 */

import {
  buildRecipeCoverage,
  summarizeRecipeCoverage,
  findUnusedIngredients,
} from '@/lib/inventory/recipe-coverage'
import type { InventoryItem, MenuItem, Recipe, RecipeComponent } from '@/types/database'

function dish(id: string, name: string): MenuItem {
  return { id, name, tenant_id: 't1', is_available: true } as MenuItem
}

function baseRecipe(id: string, menuItemId: string): Recipe {
  return { id, tenant_id: 't1', target_type: 'menu_item', menu_item_id: menuItemId } as Recipe
}

function component(recipeId: string, ingredientId: string): RecipeComponent {
  return {
    id: `${recipeId}-${ingredientId}`,
    tenant_id: 't1',
    recipe_id: recipeId,
    inventory_item_id: ingredientId,
  } as RecipeComponent
}

function ingredient(id: string, name: string): InventoryItem {
  return { id, name, tenant_id: 't1', is_active: true } as InventoryItem
}

describe('buildRecipeCoverage', () => {
  it('reports a dish with a base recipe as covered, counting its ingredients', () => {
    const rows = buildRecipeCoverage(
      [dish('m1', 'Carbonara')],
      [baseRecipe('r1', 'm1')],
      [component('r1', 'flour'), component('r1', 'cheese')],
    )

    expect(rows).toEqual([
      { menuItemId: 'm1', name: 'Carbonara', hasRecipe: true, ingredientCount: 2 },
    ])
  })

  it('reports a dish with no recipe at all as uncovered', () => {
    const rows = buildRecipeCoverage([dish('m1', 'Carbonara')], [], [])

    expect(rows[0]).toMatchObject({ hasRecipe: false, ingredientCount: 0 })
  })

  it('treats a recipe with no components as uncovered, not as set up', () => {
    // An empty recipe row is a shell that depletes nothing. Counting it as
    // covered would tell the merchant a dish is ready when it does nothing.
    const rows = buildRecipeCoverage([dish('m1', 'Carbonara')], [baseRecipe('r1', 'm1')], [])

    expect(rows[0]).toMatchObject({ hasRecipe: false, ingredientCount: 0 })
  })

  it('ignores a prep recipe, which belongs to an ingredient rather than a dish', () => {
    const prep = { id: 'r-prep', tenant_id: 't1', target_type: 'prep_item' } as Recipe

    const rows = buildRecipeCoverage(
      [dish('m1', 'Carbonara')],
      [prep],
      [component('r-prep', 'flour')],
    )

    expect(rows[0]).toMatchObject({ hasRecipe: false })
  })

  it('lists dishes with no recipe first, because those are the ones to act on', () => {
    const rows = buildRecipeCoverage(
      [dish('m1', 'Adobo'), dish('m2', 'Bicol Express')],
      [baseRecipe('r1', 'm1')],
      [component('r1', 'pork')],
    )

    expect(rows.map((r) => r.name)).toEqual(['Bicol Express', 'Adobo'])
  })

  it('orders alphabetically within a group, so the list is stable between visits', () => {
    const rows = buildRecipeCoverage(
      [dish('m2', 'Sisig'), dish('m1', 'Adobo'), dish('m3', 'Bicol Express')],
      [],
      [],
    )

    expect(rows.map((r) => r.name)).toEqual(['Adobo', 'Bicol Express', 'Sisig'])
  })
})

describe('summarizeRecipeCoverage', () => {
  it('counts how many dishes are set up out of the total', () => {
    const rows = buildRecipeCoverage(
      [dish('m1', 'Adobo'), dish('m2', 'Sisig')],
      [baseRecipe('r1', 'm1')],
      [component('r1', 'pork')],
    )

    expect(summarizeRecipeCoverage(rows)).toEqual({ total: 2, covered: 1, uncovered: 1 })
  })

  it('reports an empty menu without dividing by zero', () => {
    expect(summarizeRecipeCoverage([])).toEqual({ total: 0, covered: 0, uncovered: 0 })
  })
})

describe('findUnusedIngredients', () => {
  it('names an ingredient no recipe references', () => {
    // The brewdazeexpress case exactly: stock on the shelf that can never move,
    // because nothing consumes it.
    const unused = findUnusedIngredients(
      [ingredient('flour', 'Flour'), ingredient('mozza', 'Mozzarella')],
      [component('r1', 'flour')],
    )

    expect(unused.map((i) => i.name)).toEqual(['Mozzarella'])
  })

  it('counts an ingredient used only by an addon recipe as used', () => {
    // Coverage asks about BASE recipes, but "is this ingredient used?" is a
    // different question — an option's ingredient is still consumed by sales.
    const unused = findUnusedIngredients(
      [ingredient('syrup', 'Vanilla Syrup')],
      [component('r-addon', 'syrup')],
    )

    expect(unused).toEqual([])
  })

  it('leaves out inactive ingredients, which the merchant has already retired', () => {
    const retired = { ...ingredient('old', 'Old Stock'), is_active: false } as InventoryItem

    expect(findUnusedIngredients([retired], [])).toEqual([])
  })

  it('returns nothing when every ingredient is used', () => {
    expect(findUnusedIngredients([ingredient('flour', 'Flour')], [component('r1', 'flour')])).toEqual(
      [],
    )
  })
})

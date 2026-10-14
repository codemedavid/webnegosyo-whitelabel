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

describe('portion picks that deduct nothing', () => {
  // Live root cause (2026-10-13): "pick your flavours ×N" dishes whose picks
  // have no recipe deduct only the dish's base recipe, once per order line.
  // The key is absent when there is nothing to say.
  const flavours = {
    id: 'g-flavours', name: 'Flavours', selection_mode: 'quantity' as const, min_select: 1, max_select: 6, display_order: 0,
    options: [
      { id: 'o-garlic', name: 'Garlic', price_modifier: 0, display_order: 0 },
      { id: 'o-spicy', name: 'Spicy', price_modifier: 0, display_order: 1 },
    ],
  }
  const size = {
    id: 'g-size', name: 'Size', min_select: 1, max_select: 1, display_order: 1,
    options: [{ id: 'o-large', name: 'Large', price_modifier: 20, display_order: 0 }],
  }
  const wings = { ...dish('m-wings', 'Wings'), modifier_groups: [flavours, size] } as MenuItem
  const optionRecipe = (id: string, optionId: string): Recipe =>
    ({ id, tenant_id: 't1', target_type: 'modifier_option', menu_item_id: 'm-wings', modifier_option_id: optionId }) as Recipe

  it('flags a tracked dish whose portion group has no recipe on any choice', () => {
    const [row] = buildRecipeCoverage([wings], [baseRecipe('r1', 'm-wings')], [component('r1', 'chicken')])

    expect(row.hasRecipe).toBe(true)
    expect(row.unrecipedOptionGroups ?? []).toEqual(['Flavours'])
  })

  it('does not flag a single-choice group (it does not multiply portions)', () => {
    const [row] = buildRecipeCoverage([wings], [baseRecipe('r1', 'm-wings')], [component('r1', 'chicken')])

    expect(row.unrecipedOptionGroups ?? []).not.toContain('Size')
  })

  it('clears the flag once a choice in the group has its own recipe', () => {
    const [row] = buildRecipeCoverage(
      [wings],
      [baseRecipe('r1', 'm-wings'), optionRecipe('r2', 'o-garlic')],
      [component('r1', 'chicken'), component('r2', 'garlic')],
    )

    expect(row.unrecipedOptionGroups ?? []).toEqual([])
  })

  it('does not flag a group whose choices are other dishes or counted by hand', () => {
    const linked = { ...flavours, options: [{ ...flavours.options[0], menu_item_id: 'm-sauce' }] }
    const counted = { ...flavours, id: 'g2', name: 'Dips', options: [{ ...flavours.options[1], stock_mode: 'simple' as const, stock_qty: 4 }] }
    const item = { ...wings, modifier_groups: [linked, counted] } as MenuItem

    const [row] = buildRecipeCoverage([item], [baseRecipe('r1', 'm-wings')], [component('r1', 'chicken')])

    expect(row.unrecipedOptionGroups ?? []).toEqual([])
  })

  it('leaves the hint off a dish with no recipe at all (it is already flagged)', () => {
    const [row] = buildRecipeCoverage([wings], [], [])

    expect(row.unrecipedOptionGroups ?? []).toEqual([])
  })

  it('reads legacy add-ons as a portion group', () => {
    const item = { ...dish('m-rice', 'Rice bowl'), addons: [{ id: 'a-egg', name: 'Egg', price: 15 }] } as MenuItem

    const [row] = buildRecipeCoverage([item], [baseRecipe('r1', 'm-rice')], [component('r1', 'rice')])

    expect(row.unrecipedOptionGroups ?? []).toEqual(['Add-ons'])
  })
})

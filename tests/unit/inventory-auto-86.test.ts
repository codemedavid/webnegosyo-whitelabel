/**
 * Phase 5B — auto-86: which menu items an out-of-stock ingredient makes
 * unsellable.
 *
 * The decisive rule is that only the BASE recipe can 86 an item. If the
 * ingredient is only used by one variation option or addon, the item is still
 * sellable in its other configurations, and taking the whole item off the menu
 * would cost the merchant sales they could have made.
 */

import { resolveMenuItemsToDisable } from '@/lib/inventory/auto-86'
import type { Recipe, RecipeComponent } from '@/types/database'

function recipe(overrides: Partial<Recipe> & Pick<Recipe, 'id'>): Recipe {
  return {
    tenant_id: 'tenant-1',
    target_type: 'menu_item',
    menu_item_id: 'menu-1',
    variation_option_id: null,
    modifier_option_id: null,
    addon_id: null,
    prep_item_id: null,
    yield_quantity: null,
    yield_unit_id: null,
    ...overrides,
  } as Recipe
}

function component(recipeId: string, inventoryItemId: string): RecipeComponent {
  return {
    id: `${recipeId}-${inventoryItemId}`,
    tenant_id: 'tenant-1',
    recipe_id: recipeId,
    inventory_item_id: inventoryItemId,
    quantity: 1,
    unit_id: 'unit-g',
    sort_order: 0,
  } as RecipeComponent
}

describe('resolveMenuItemsToDisable', () => {
  it('disables a menu item whose base recipe uses an out-of-stock ingredient', () => {
    const recipes = [recipe({ id: 'r-base', target_type: 'menu_item', menu_item_id: 'menu-1' })]
    const components = [component('r-base', 'flour')]

    expect(resolveMenuItemsToDisable(['flour'], recipes, components)).toEqual(['menu-1'])
  })

  it('leaves a menu item alone when only a variation option needs the ingredient', () => {
    // The item still sells in every other size — 86ing it would cost the
    // merchant the sales they could still have made.
    const recipes = [
      recipe({ id: 'r-base', target_type: 'menu_item', menu_item_id: 'menu-1' }),
      recipe({
        id: 'r-large',
        target_type: 'variation_option',
        menu_item_id: 'menu-1',
        variation_option_id: 'opt-large',
      }),
    ]
    const components = [component('r-base', 'cocoa'), component('r-large', 'flour')]

    expect(resolveMenuItemsToDisable(['flour'], recipes, components)).toEqual([])
  })

  it('leaves a menu item alone when only an addon needs the ingredient', () => {
    const recipes = [
      recipe({ id: 'r-base', target_type: 'menu_item', menu_item_id: 'menu-1' }),
      recipe({ id: 'r-addon', target_type: 'addon', menu_item_id: 'menu-1', addon_id: 'add-cheese' }),
    ]
    const components = [component('r-base', 'cocoa'), component('r-addon', 'flour')]

    expect(resolveMenuItemsToDisable(['flour'], recipes, components)).toEqual([])
  })

  it('leaves a menu item alone when only a modifier option needs the ingredient', () => {
    const recipes = [
      recipe({ id: 'r-base', target_type: 'menu_item', menu_item_id: 'menu-1' }),
      recipe({
        id: 'r-mod',
        target_type: 'modifier_option',
        menu_item_id: 'menu-1',
        modifier_option_id: 'mod-oat',
      }),
    ]
    const components = [component('r-base', 'cocoa'), component('r-mod', 'flour')]

    expect(resolveMenuItemsToDisable(['flour'], recipes, components)).toEqual([])
  })

  it('disables every menu item sharing the out-of-stock ingredient', () => {
    const recipes = [
      recipe({ id: 'r-1', menu_item_id: 'menu-1' }),
      recipe({ id: 'r-2', menu_item_id: 'menu-2' }),
      recipe({ id: 'r-3', menu_item_id: 'menu-3' }),
    ]
    const components = [
      component('r-1', 'flour'),
      component('r-2', 'flour'),
      component('r-3', 'sugar'),
    ]

    expect(resolveMenuItemsToDisable(['flour'], recipes, components).sort()).toEqual([
      'menu-1',
      'menu-2',
    ])
  })

  it('names a menu item once even when several of its ingredients ran out', () => {
    const recipes = [recipe({ id: 'r-base', menu_item_id: 'menu-1' })]
    const components = [component('r-base', 'flour'), component('r-base', 'sugar')]

    expect(resolveMenuItemsToDisable(['flour', 'sugar'], recipes, components)).toEqual(['menu-1'])
  })

  it('returns nothing when no ingredient is out of stock', () => {
    const recipes = [recipe({ id: 'r-base', menu_item_id: 'menu-1' })]

    expect(resolveMenuItemsToDisable([], recipes, [component('r-base', 'flour')])).toEqual([])
  })

  it('returns nothing when the out-of-stock ingredient is in no recipe', () => {
    const recipes = [recipe({ id: 'r-base', menu_item_id: 'menu-1' })]

    expect(resolveMenuItemsToDisable(['napkins'], recipes, [component('r-base', 'flour')])).toEqual(
      [],
    )
  })

  it('ignores a prep recipe, which names no menu item to disable', () => {
    // A prep item is stocked in its own right, so it goes out of stock as an
    // ingredient. Its recipe describes how it is made, not what sells it.
    const recipes = [
      recipe({
        id: 'r-prep',
        target_type: 'prep_item',
        menu_item_id: null,
        prep_item_id: 'prep-sauce',
      }),
    ]

    expect(resolveMenuItemsToDisable(['flour'], recipes, [component('r-prep', 'flour')])).toEqual([])
  })
})

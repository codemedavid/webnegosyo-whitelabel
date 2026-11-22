import { changesToPayload, recipesFromRows, type RecipeComponentRow as RecipeComponent, type RecipeRow as Recipe } from '@/lib/inventory/dish-recipe/rows'
import { GROUPS } from './dish-recipe-fixtures'

const recipe = (id: string, columns: Partial<Recipe>): Recipe =>
  ({ id, target_type: 'menu_item', ...columns })
const component = (recipeId: string, item: string, quantity: number | string, sort = 0): RecipeComponent =>
  ({ recipe_id: recipeId, inventory_item_id: item, quantity, unit_id: 'ml', sort_order: sort })

describe('recipesFromRows', () => {
  it('reads the dish recipe and each choice under its own kind, numbers from numeric strings', () => {
    const stored = recipesFromRows(
      GROUPS,
      [recipe('b', { target_type: 'menu_item' }), recipe('l', { target_type: 'modifier_option', modifier_option_id: 'large' })],
      [component('b', 'milk', '180.0000'), component('l', 'milk', 70)],
    )
    expect(stored.base).toEqual([{ inventoryItemId: 'milk', quantity: 180, unitId: 'ml' }])
    expect(stored.options.large).toEqual([{ inventoryItemId: 'milk', quantity: 70, unitId: 'ml' }])
    expect(stored.options.small).toEqual([])
  })

  it('falls back to a legacy twin (same choice id, other kind) — depletion still spends it', () => {
    const stored = recipesFromRows(
      GROUPS,
      [recipe('v', { target_type: 'variation_option', variation_option_id: 'medium' })],
      [component('v', 'milk', 40)],
    )
    expect(stored.options.medium).toEqual([{ inventoryItemId: 'milk', quantity: 40, unitId: 'ml' }])
  })

  it('prefers the choice\'s own kind over a twin', () => {
    const stored = recipesFromRows(
      GROUPS,
      [
        recipe('v', { target_type: 'variation_option', variation_option_id: 'medium' }),
        recipe('m', { target_type: 'modifier_option', modifier_option_id: 'medium' }),
      ],
      [component('v', 'milk', 40), component('m', 'milk', 55)],
    )
    expect(stored.options.medium[0].quantity).toBe(55)
  })
})

describe('changesToPayload', () => {
  it('writes each choice under the kind the dish sells it through; unknown ids are dropped', () => {
    const payload = changesToPayload(GROUPS, [
      { optionId: null, lines: [{ inventoryItemId: 'milk', quantity: 1, unitId: 'ml' }] },
      { optionId: 'large', lines: [] },
      { optionId: 'gone', lines: [] },
    ])
    expect(payload).toEqual([
      { target_type: 'menu_item', option_id: null, components: [{ inventory_item_id: 'milk', quantity: 1, unit_id: 'ml' }] },
      { target_type: 'modifier_option', option_id: 'large', components: [] },
    ])
  })
})

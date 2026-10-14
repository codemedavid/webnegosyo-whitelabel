/**
 * The one rule for whether a recipe line can ever be deducted.
 *
 * A line asking for nothing, or measured in a unit that can never convert to
 * the ingredient's stock unit (grams of an egg stocked by the piece), is saved
 * today and then skipped by every sale. These refuse it at save, with a
 * message the merchant can act on. Pure, so the merchant app can mirror it.
 */

import {
  compatibleRecipeUnits,
  findRecipeProblem,
  recipeLineProblem,
  unitAfterIngredientChange,
} from '@/lib/inventory/recipe-line-rules'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'

const GRAM: InventoryUnit = { id: 'g', name: 'gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 }
const KILO: InventoryUnit = { id: 'kg', name: 'kilogram', abbreviation: 'kg', dimension: 'weight', to_base_factor: 1000 }
const ML: InventoryUnit = { id: 'ml', name: 'millilitre', abbreviation: 'ml', dimension: 'volume', to_base_factor: 1 }
const PIECE: InventoryUnit = { id: 'pc', name: 'piece', abbreviation: 'pc', dimension: 'count', to_base_factor: 1 }
const UNITS = [GRAM, KILO, ML, PIECE]

const EGG = { name: 'Egg', stock_unit_id: 'pc' }
const MILK = { name: 'Milk', stock_unit_id: 'ml' }

describe('recipeLineProblem', () => {
  it('accepts a line in the stock unit', () => {
    expect(recipeLineProblem({ quantity: 2, unit_id: 'pc' }, EGG, UNITS)).toBeNull()
  })

  it('accepts a line in another unit of the same kind', () => {
    expect(recipeLineProblem({ quantity: 0.2, unit_id: 'kg' }, { name: 'Flour', stock_unit_id: 'g' }, UNITS)).toBeNull()
  })

  it('accepts grams of something stocked in millilitres (water-density bridge)', () => {
    expect(recipeLineProblem({ quantity: 30, unit_id: 'g' }, MILK, UNITS)).toBeNull()
  })

  it('refuses a weight unit for an ingredient counted by the piece, naming both', () => {
    const problem = recipeLineProblem({ quantity: 50, unit_id: 'g' }, EGG, UNITS)
    expect(problem).toContain('Egg')
    expect(problem).toContain('pc')
    expect(problem).toContain('g')
  })

  it('refuses a piece count for an ingredient stocked by volume', () => {
    expect(recipeLineProblem({ quantity: 1, unit_id: 'pc' }, MILK, UNITS)).toContain('Milk')
  })

  it.each([0, -1, Number.NaN])('refuses a quantity of %p', (quantity) => {
    expect(recipeLineProblem({ quantity, unit_id: 'pc' }, EGG, UNITS)).toMatch(/Egg.*more than 0/)
  })

  it('refuses a unit that is not in the catalogue', () => {
    expect(recipeLineProblem({ quantity: 1, unit_id: 'gone' }, EGG, UNITS)).toContain('Egg')
  })

  it('has no opinion on units when the stock unit itself is unknown', () => {
    expect(recipeLineProblem({ quantity: 1, unit_id: 'g' }, { name: 'X', stock_unit_id: 'gone' }, UNITS)).toBeNull()
  })
})

describe('compatibleRecipeUnits', () => {
  it('offers only units that convert to the stock unit', () => {
    expect(compatibleRecipeUnits('pc', UNITS).map((unit) => unit.id)).toEqual(['pc'])
    expect(compatibleRecipeUnits('ml', UNITS).map((unit) => unit.id)).toEqual(['g', 'kg', 'ml'])
  })

  it('offers every unit while no ingredient (or an unknown stock unit) is chosen', () => {
    expect(compatibleRecipeUnits('', UNITS)).toHaveLength(4)
    expect(compatibleRecipeUnits('gone', UNITS)).toHaveLength(4)
  })
})

describe('findRecipeProblem', () => {
  const ingredients = new Map([['egg', EGG], ['milk', MILK]])

  it('is null when every line can be deducted', () => {
    expect(findRecipeProblem(
      [{ inventory_item_id: 'egg', quantity: 1, unit_id: 'pc' }, { inventory_item_id: 'milk', quantity: 200, unit_id: 'ml' }],
      ingredients, UNITS,
    )).toBeNull()
  })

  it('reports the first line that cannot', () => {
    expect(findRecipeProblem(
      [{ inventory_item_id: 'milk', quantity: 200, unit_id: 'ml' }, { inventory_item_id: 'egg', quantity: 50, unit_id: 'g' }],
      ingredients, UNITS,
    )).toContain('Egg')
  })

  it('refuses a line naming an ingredient that no longer exists', () => {
    expect(findRecipeProblem([{ inventory_item_id: 'gone', quantity: 1, unit_id: 'g' }], ingredients, UNITS))
      .toMatch(/no longer exists/)
  })
})

describe('unitAfterIngredientChange', () => {
  it('keeps a unit that still converts', () => {
    expect(unitAfterIngredientChange('kg', 'g', UNITS)).toBe('kg')
  })

  it('switches to the stock unit when the old unit cannot measure the new ingredient', () => {
    expect(unitAfterIngredientChange('g', 'pc', UNITS)).toBe('pc')
  })

  it('fills the stock unit into a line that had none', () => {
    expect(unitAfterIngredientChange('', 'ml', UNITS)).toBe('ml')
  })
})

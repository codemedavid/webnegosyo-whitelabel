/**
 * Deleting an ingredient.
 *
 * The web's Delete ran a bare DELETE that the database refused for every
 * ingredient used in a recipe (recipe_components is ON DELETE RESTRICT), and
 * for one NOT in a recipe it silently cascaded away the whole stock ledger —
 * while the dialog promised "Past stock movements are kept".
 *
 * `delete_inventory_item` now decides: recipe lines are removed, and an
 * ingredient with stock history is archived instead of deleted. These pure
 * helpers read that decision and tell the merchant exactly what will happen —
 * and what did.
 */

import {
  parseIngredientDeleteImpact,
  describeIngredientDelete,
  describeIngredientDeleteOutcome,
  applyIngredientDeleteOutcome,
} from '@/lib/inventory/ingredient-delete'
import type { InventoryItem } from '@/types/database'

const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: 'i1', tenant_id: 't1', name: 'Rice', sku: null, category: null,
  stock_unit_id: 'u1', unit_cost: 1, is_prep: false, image_url: null, current_qty: 0,
  reorder_level: 0, is_active: true, created_at: '', updated_at: '',
  ...over,
})

describe('parseIngredientDeleteImpact', () => {
  it('reads the RPC payload', () => {
    expect(
      parseIngredientDeleteImpact({ outcome: 'archived', recipe_count: 3, recipe_lines_removed: 3 }),
    ).toEqual({ outcome: 'archived', recipeCount: 3, recipeLinesRemoved: 3 })
  })

  it('refuses a payload it does not understand rather than guessing an outcome', () => {
    expect(() => parseIngredientDeleteImpact({ outcome: 'gone' })).toThrow()
    expect(() => parseIngredientDeleteImpact(null)).toThrow()
  })
})

describe('describeIngredientDelete', () => {
  it('says a plain delete is a delete', () => {
    const text = describeIngredientDelete('Rice', { outcome: 'deleted', recipeCount: 0, recipeLinesRemoved: 0 })

    expect(text).toMatch(/^Delete Rice\?/)
    expect(text).not.toMatch(/recipe/i)
  })

  it('names how many recipes lose the ingredient', () => {
    expect(
      describeIngredientDelete('Rice', { outcome: 'deleted', recipeCount: 1, recipeLinesRemoved: 0 }),
    ).toMatch(/1 recipe uses it/)
    expect(
      describeIngredientDelete('Rice', { outcome: 'deleted', recipeCount: 4, recipeLinesRemoved: 0 }),
    ).toMatch(/4 recipes use it/)
  })

  it('warns that an ingredient with stock history is kept as "Not in use", not erased', () => {
    const text = describeIngredientDelete('Rice', { outcome: 'archived', recipeCount: 0, recipeLinesRemoved: 0 })

    expect(text).toMatch(/stock history/i)
    expect(text).toMatch(/not in use/i)
  })
})

describe('describeIngredientDeleteOutcome', () => {
  it('confirms a delete', () => {
    expect(
      describeIngredientDeleteOutcome('Rice', { outcome: 'deleted', recipeCount: 0, recipeLinesRemoved: 0 }),
    ).toBe('Rice deleted')
  })

  it('confirms an archive and how many recipe lines went', () => {
    expect(
      describeIngredientDeleteOutcome('Rice', { outcome: 'archived', recipeCount: 2, recipeLinesRemoved: 2 }),
    ).toBe('Rice marked Not in use — its stock history is kept. Removed from 2 recipes.')
  })
})

describe('applyIngredientDeleteOutcome', () => {
  const rice = item({})
  const salt = item({ id: 'i2', name: 'Salt' })

  it('drops a deleted ingredient', () => {
    expect(applyIngredientDeleteOutcome([rice, salt], 'i1', 'deleted')).toEqual([salt])
  })

  it('keeps an archived ingredient, switched off, without mutating the original', () => {
    const next = applyIngredientDeleteOutcome([rice, salt], 'i1', 'archived')

    expect(next).toEqual([{ ...rice, is_active: false }, salt])
    expect(rice.is_active).toBe(true)
  })
})

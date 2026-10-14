/**
 * Which staff grants an ingredient write needs (Phase 0d).
 *
 * Mirrors `inventory_items_client_guard` in migration 20261013120100 so the web
 * refuses with a sentence before the database refuses with a 42501:
 *   - the master (name, unit, category, photo, archive) is `menu`;
 *   - what it costs is `costs`;
 *   - its reorder level is `inventory`.
 * Only a CHANGED field asks for its grant, so a form that resubmits unchanged
 * values never needs more than the field the person actually edited.
 */

import {
  grantsForIngredientWrite,
  ingredientWriteRefusal,
  INGREDIENT_REFUSALS,
} from '@/lib/inventory/ingredient-write-grants'

const STORED = {
  name: 'Beef',
  sku: null,
  category: 'Meat',
  stock_unit_id: 'unit-kg',
  unit_cost: 420,
  is_prep: false,
  image_url: null,
  reorder_level: 5,
  is_active: true,
}

const staff = (permissions: string[]) => ({ role: 'admin', is_owner: false, permissions })

describe('grantsForIngredientWrite', () => {
  it('lets a starting reorder level ride with adding the ingredient, as the database does', () => {
    expect(grantsForIngredientWrite(null, { name: 'Beef', unit_cost: 0, reorder_level: 5 })).toEqual(['menu'])
  })

  test('a new ingredient is the menu, and its price is costs only when it has one', () => {
    expect(grantsForIngredientWrite(null, { ...STORED, unit_cost: 0 })).toEqual(['menu'])
    expect(grantsForIngredientWrite(null, STORED)).toEqual(['menu', 'costs'])
  })

  test('a resubmitted form that changes nothing asks for no grant at all', () => {
    expect(grantsForIngredientWrite(STORED, { ...STORED })).toEqual([])
  })

  test('each changed field asks for its own grant', () => {
    expect(grantsForIngredientWrite(STORED, { ...STORED, name: 'Ground beef' })).toEqual(['menu'])
    expect(grantsForIngredientWrite(STORED, { ...STORED, unit_cost: 450 })).toEqual(['costs'])
    expect(grantsForIngredientWrite(STORED, { ...STORED, reorder_level: 8 })).toEqual(['inventory'])
    expect(grantsForIngredientWrite(STORED, { ...STORED, is_active: false, unit_cost: 1 })).toEqual(['menu', 'costs'])
  })

  test('a field left out of the write is not a change', () => {
    expect(grantsForIngredientWrite(STORED, { name: 'Beef', reorder_level: 5 })).toEqual([])
  })

  test('a numeric column read back as a string is compared as a number', () => {
    expect(grantsForIngredientWrite({ ...STORED, unit_cost: '420.00' as unknown as number }, { unit_cost: 420 })).toEqual([])
  })
})

describe('ingredientWriteRefusal', () => {
  test('an inventory-only account may move a reorder level but not the price or the name', () => {
    const clerk = staff(['inventory'])

    expect(ingredientWriteRefusal(clerk, ['inventory'])).toBeNull()
    expect(ingredientWriteRefusal(clerk, ['costs'])).toBe(INGREDIENT_REFUSALS.costs)
    expect(ingredientWriteRefusal(clerk, ['menu'])).toBe(INGREDIENT_REFUSALS.menu)
  })

  test('a menu-only account may rename but not reprice', () => {
    const cook = staff(['menu'])

    expect(ingredientWriteRefusal(cook, ['menu'])).toBeNull()
    expect(ingredientWriteRefusal(cook, ['menu', 'costs'])).toBe(INGREDIENT_REFUSALS.costs)
  })

  test('a no-change write still needs one ingredient-side grant', () => {
    expect(ingredientWriteRefusal(staff(['costs']), [])).toBeNull()
    expect(ingredientWriteRefusal(staff(['pos']), [])).toBe(INGREDIENT_REFUSALS.menu)
  })

  test('owners and legacy full-access accounts pass everything', () => {
    expect(ingredientWriteRefusal({ role: 'admin', is_owner: true, permissions: [] }, ['menu', 'costs', 'inventory'])).toBeNull()
    expect(ingredientWriteRefusal({ role: 'admin', is_owner: false, permissions: null }, ['costs'])).toBeNull()
  })

  test('refusals name the grant in words a merchant knows', () => {
    expect(INGREDIENT_REFUSALS.costs).toMatch(/Costs & Profit permission/)
    expect(INGREDIENT_REFUSALS.inventory).toMatch(/Inventory permission/)
    expect(INGREDIENT_REFUSALS.menu).toMatch(/Menu permission/)
  })
})

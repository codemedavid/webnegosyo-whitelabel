/**
 * The producible ceiling for a dish IN THE CONFIGURATION IT WAS ORDERED.
 *
 * Depletion spends the base recipe plus every selected option, add-on and
 * modifier-option recipe, × add-on portions (`resolveOrderDepletions`). A guard
 * that judges only the base recipe accepts carts depletion then drives
 * negative — e.g. a peanut-butter jar whose stock lives entirely in its Size
 * options. These pin that the guard reads exactly what depletion spends.
 */

import {
  describeStockShortfalls,
  findCartStockShortfalls,
  resolveOptionCeilings,
  resolveProducibleUnits,
  type ProducibleStock,
} from '@/lib/inventory/producible'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'
import type { Recipe, RecipeComponent } from '@/types/database'

const GRAM: InventoryUnit = { id: 'g', name: 'Gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 }
const KILO: InventoryUnit = { id: 'kg', name: 'Kilogram', abbreviation: 'kg', dimension: 'weight', to_base_factor: 1000 }
const PIECE: InventoryUnit = { id: 'pc', name: 'Piece', abbreviation: 'pc', dimension: 'count', to_base_factor: 1 }
const UNITS = [GRAM, KILO, PIECE]

const recipe = (over: Partial<Recipe>): Recipe =>
  ({ tenant_id: 't', target_type: 'menu_item', menu_item_id: 'milktea', created_at: '', updated_at: '', ...over }) as Recipe

const line = (over: Partial<RecipeComponent>): RecipeComponent =>
  ({ tenant_id: 't', quantity: 1, unit_id: 'g', sort_order: 0, created_at: '', ...over }) as RecipeComponent

const shelf = (id: string, qty: number, stockUnit: InventoryUnit = GRAM): ProducibleStock => ({
  id, current_qty: qty, is_active: true, stockUnit,
})

/** Milk tea: 10 g tea base; Pearls add-on: 50 g tapioca per portion; Large: 5 g extra tea. */
const BASE = recipe({ id: 'r-base' })
const PEARLS = recipe({ id: 'r-pearls', target_type: 'modifier_option', modifier_option_id: 'pearls' })
const LARGE = recipe({ id: 'r-large', target_type: 'modifier_option', modifier_option_id: 'large' })
const RECIPES = [BASE, PEARLS, LARGE]
const COMPONENTS = [
  line({ id: 'c-tea', recipe_id: 'r-base', inventory_item_id: 'tea', quantity: 10 }),
  line({ id: 'c-tap', recipe_id: 'r-pearls', inventory_item_id: 'tapioca', quantity: 50 }),
  line({ id: 'c-large', recipe_id: 'r-large', inventory_item_id: 'tea', quantity: 5 }),
]

describe('resolveProducibleUnits with selections', () => {
  it('constrains a dish whose stock lives only in an option recipe', () => {
    // Arrange: no base recipe; the 600 g jar option takes 1 jar per sale.
    const jar = recipe({ id: 'r-600', target_type: 'modifier_option', menu_item_id: 'peanut', modifier_option_id: 'big' })
    const jarLine = line({ id: 'c-jar', recipe_id: 'r-600', inventory_item_id: 'jar', quantity: 1, unit_id: 'pc' })

    // Act
    const units = resolveProducibleUnits(
      { menuItemId: 'peanut', modifierOptionIds: ['big'] },
      [jar], [jarLine], [shelf('jar', 2, PIECE)], UNITS,
    )

    // Assert
    expect(units).toBe(2)
  })

  it('adds an option recipe to the base recipe, never instead of it', () => {
    // 15 g tea per Large; 100 g on hand → 6 (base alone would say 10).
    const units = resolveProducibleUnits(
      { menuItemId: 'milktea', optionIds: ['large'] }, RECIPES, COMPONENTS,
      [shelf('tea', 100), shelf('tapioca', 1000)], UNITS,
    )
    expect(units).toBe(6)
  })

  it('multiplies an add-on recipe by its portions', () => {
    // 2 portions of pearls = 100 g tapioca per drink; 250 g → 2 drinks.
    const units = resolveProducibleUnits(
      { menuItemId: 'milktea', addonIds: ['pearls'], addonQuantities: { pearls: 2 } }, RECIPES, COMPONENTS,
      [shelf('tea', 1000), shelf('tapioca', 250)], UNITS,
    )
    expect(units).toBe(2)
  })

  it('converts an option recipe unit into the ingredient stock unit', () => {
    const units = resolveProducibleUnits(
      { menuItemId: 'milktea', addonIds: ['pearls'] }, RECIPES, COMPONENTS,
      [shelf('tea', 1000), shelf('tapioca', 0.2, KILO)], UNITS,
    )
    expect(units).toBe(4)
  })

  it('still reads only the base recipe when nothing is selected', () => {
    const units = resolveProducibleUnits(
      { menuItemId: 'milktea' }, RECIPES, COMPONENTS, [shelf('tea', 100), shelf('tapioca', 0)], UNITS,
    )
    expect(units).toBe(10)
  })
})

describe('findCartStockShortfalls with selections', () => {
  it('refuses a cart whose selected add-on needs an exhausted ingredient', () => {
    const shortfalls = findCartStockShortfalls(
      [{ menuItemId: 'milktea', quantity: 1, addonIds: ['pearls'], optionLabel: 'Pearls' }],
      RECIPES, COMPONENTS, [shelf('tea', 1000), shelf('tapioca', 0)], UNITS,
    )
    expect(shortfalls).toEqual([{ menuItemId: 'milktea', requested: 1, producible: 0, optionLabel: 'Pearls' }])
  })

  it('judges two configurations of one dish separately, sharing the shelf', () => {
    // 100 g tea: 2 Large (30 g) leaves 70 g → 7 plain; the cart asks 8 plain.
    const shortfalls = findCartStockShortfalls(
      [
        { menuItemId: 'milktea', quantity: 2, optionIds: ['large'], optionLabel: 'Large' },
        { menuItemId: 'milktea', quantity: 8 },
      ],
      RECIPES, COMPONENTS, [shelf('tea', 100), shelf('tapioca', 1000)], UNITS,
    )
    expect(shortfalls).toEqual([{ menuItemId: 'milktea', requested: 8, producible: 7 }])
  })

  it('merges lines of the same configuration whatever order the ids arrive in', () => {
    const shortfalls = findCartStockShortfalls(
      [
        { menuItemId: 'milktea', quantity: 3, addonIds: ['pearls'], optionIds: ['large'] },
        { menuItemId: 'milktea', quantity: 3, optionIds: ['large'], addonIds: ['pearls'] },
      ],
      RECIPES, COMPONENTS, [shelf('tea', 1000), shelf('tapioca', 250)], UNITS,
    )
    expect(shortfalls).toEqual([{ menuItemId: 'milktea', requested: 6, producible: 5 }])
  })
})

describe('describeStockShortfalls with an option', () => {
  it('names the dish and the option the diner picked', () => {
    const message = describeStockShortfalls(
      [
        { menuItemId: 'milktea', requested: 1, producible: 0, optionLabel: 'Pearls' },
        { menuItemId: 'latte', requested: 5, producible: 2, optionLabel: 'Large' },
      ],
      new Map([['milktea', 'Milk Tea'], ['latte', 'Latte']]),
    )
    expect(message).toContain('Milk Tea (Pearls) is sold out')
    expect(message).toContain('Latte (Large) has only 2 left')
  })
})

describe('resolveOptionCeilings', () => {
  it('reports how many of the dish can be made WITH each option that has its own recipe', () => {
    const ceilings = resolveOptionCeilings(RECIPES, COMPONENTS, [shelf('tea', 100), shelf('tapioca', 120)], UNITS)
    expect(ceilings.get('milktea')).toEqual(new Map([['pearls', 2], ['large', 6]]))
  })

  it('reads zero for an option whose ingredient is exhausted', () => {
    const ceilings = resolveOptionCeilings(RECIPES, COMPONENTS, [shelf('tea', 100), shelf('tapioca', 0)], UNITS)
    expect(ceilings.get('milktea')?.get('pearls')).toBe(0)
  })

  it('leaves out an option whose recipe names nothing judgeable at this shelf', () => {
    // No tapioca row (e.g. a branch that never set per-branch stock): ignorance, not zero.
    const ceilings = resolveOptionCeilings(RECIPES, COMPONENTS, [shelf('tea', 100)], UNITS)
    expect(ceilings.get('milktea')?.has('pearls')).toBe(false)
    expect(ceilings.get('milktea')?.get('large')).toBe(6)
  })

  it('skips options the caller marks as counted separately (simple stock)', () => {
    const ceilings = resolveOptionCeilings(
      RECIPES, COMPONENTS, [shelf('tea', 100), shelf('tapioca', 0)], UNITS, new Set(['pearls']),
    )
    expect(ceilings.get('milktea')?.has('pearls')).toBe(false)
  })

  it('has no entry for a dish without option recipes', () => {
    const ceilings = resolveOptionCeilings([BASE], COMPONENTS, [shelf('tea', 100)], UNITS)
    expect(ceilings.has('milktea')).toBe(false)
  })
})

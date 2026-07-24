import { buildCostingGraph, resolveConfiguredRecipeIds } from '@/lib/inventory/graph-builder'
import { computeRecipeCost, computeConfiguredCost } from '@/lib/inventory/costing'
import type {
  InventoryUnitRow,
  InventoryItem,
  Recipe,
  RecipeComponent,
} from '@/types/database'

const gramRow: InventoryUnitRow = {
  id: 'u_g', tenant_id: 't', name: 'Gram', abbreviation: 'g', dimension: 'weight',
  to_base_factor: 1, is_base: true, is_active: true, created_at: '', updated_at: '',
}
const kgRow: InventoryUnitRow = {
  id: 'u_kg', tenant_id: 't', name: 'Kilogram', abbreviation: 'kg', dimension: 'weight',
  to_base_factor: 1000, is_base: false, is_active: true, created_at: '', updated_at: '',
}
const mlRow: InventoryUnitRow = {
  id: 'u_ml', tenant_id: 't', name: 'Millilitre', abbreviation: 'ml', dimension: 'volume',
  to_base_factor: 1, is_base: true, is_active: true, created_at: '', updated_at: '',
}

function item(over: Partial<InventoryItem> & Pick<InventoryItem, 'id' | 'stock_unit_id'>): InventoryItem {
  return {
    tenant_id: 't', name: over.id, sku: null, category: null, unit_cost: 0, is_prep: false,
    image_url: null, current_qty: 0, reorder_level: 0, is_active: true, created_at: '', updated_at: '',
    ...over,
  }
}
function comp(over: Partial<RecipeComponent> & Pick<RecipeComponent, 'recipe_id' | 'inventory_item_id' | 'quantity' | 'unit_id'>): RecipeComponent {
  return { id: `c_${over.recipe_id}_${over.inventory_item_id}`, tenant_id: 't', sort_order: 0, created_at: '', updated_at: '', ...over }
}

describe('buildCostingGraph', () => {
  test('maps rows into a graph the costing core can price', () => {
    const flour = item({ id: 'flour', stock_unit_id: 'u_g', unit_cost: 0.05 })
    const recipe: Recipe = {
      id: 'r1', tenant_id: 't', target_type: 'menu_item', menu_item_id: 'm1',
      variation_option_id: null, addon_id: null, prep_item_id: null, yield_quantity: null,
      yield_unit_id: null, notes: null, created_at: '', updated_at: '',
    }
    const components = [comp({ recipe_id: 'r1', inventory_item_id: 'flour', quantity: 0.2, unit_id: 'u_kg' })]
    const graph = buildCostingGraph([gramRow, kgRow], [flour], [recipe], components)
    // 0.2 kg → 200 g × ₱0.05 = ₱10
    expect(computeRecipeCost('r1', graph)).toBeCloseTo(10, 6)
  })

  test('wires a prep item to its prep recipe and yield', () => {
    const oil = item({ id: 'oil', stock_unit_id: 'u_ml', unit_cost: 0.2 })
    const sauce = item({ id: 'sauce', stock_unit_id: 'u_ml', is_prep: true })
    const prepRecipe: Recipe = {
      id: 'r_sauce', tenant_id: 't', target_type: 'prep_item', menu_item_id: null,
      variation_option_id: null, addon_id: null, prep_item_id: 'sauce', yield_quantity: 250,
      yield_unit_id: 'u_ml', notes: null, created_at: '', updated_at: '',
    }
    const dish: Recipe = {
      id: 'r_dish', tenant_id: 't', target_type: 'menu_item', menu_item_id: 'm2',
      variation_option_id: null, addon_id: null, prep_item_id: null, yield_quantity: null,
      yield_unit_id: null, notes: null, created_at: '', updated_at: '',
    }
    const components = [
      comp({ recipe_id: 'r_sauce', inventory_item_id: 'oil', quantity: 100, unit_id: 'u_ml' }),
      comp({ recipe_id: 'r_dish', inventory_item_id: 'sauce', quantity: 50, unit_id: 'u_ml' }),
    ]
    const graph = buildCostingGraph([mlRow], [oil, sauce], [prepRecipe, dish], components)
    // sauce: 100ml×0.2=₱20 / 250ml = ₱0.08/ml; dish 50ml×0.08 = ₱4
    expect(computeRecipeCost('r_dish', graph)).toBeCloseTo(4, 6)
  })

  test('throws on an unknown stock unit reference', () => {
    const bad = item({ id: 'x', stock_unit_id: 'u_missing', unit_cost: 1 })
    expect(() => buildCostingGraph([gramRow], [bad], [], [])).toThrow(/unit/i)
  })
})

describe('resolveConfiguredRecipeIds', () => {
  const recipes: Recipe[] = [
    { id: 'base', tenant_id: 't', target_type: 'menu_item', menu_item_id: 'm1', variation_option_id: null, addon_id: null, prep_item_id: null, yield_quantity: null, yield_unit_id: null, notes: null, created_at: '', updated_at: '' },
    { id: 'optL', tenant_id: 't', target_type: 'variation_option', menu_item_id: 'm1', variation_option_id: 'opt_large', addon_id: null, prep_item_id: null, yield_quantity: null, yield_unit_id: null, notes: null, created_at: '', updated_at: '' },
    { id: 'addC', tenant_id: 't', target_type: 'addon', menu_item_id: 'm1', variation_option_id: null, addon_id: 'addon_cheese', prep_item_id: null, yield_quantity: null, yield_unit_id: null, notes: null, created_at: '', updated_at: '' },
    { id: 'other', tenant_id: 't', target_type: 'menu_item', menu_item_id: 'm2', variation_option_id: null, addon_id: null, prep_item_id: null, yield_quantity: null, yield_unit_id: null, notes: null, created_at: '', updated_at: '' },
  ]

  test('picks the base, selected option, and addon recipes for the item', () => {
    const resolved = resolveConfiguredRecipeIds('m1', ['opt_large'], ['addon_cheese'], recipes)
    expect(resolved).toEqual({ baseRecipeId: 'base', optionRecipeIds: ['optL'], addonRecipeIds: ['addC'] })
  })

  test('unselected options and other items are excluded', () => {
    const resolved = resolveConfiguredRecipeIds('m1', [], [], recipes)
    expect(resolved).toEqual({ baseRecipeId: 'base', optionRecipeIds: [], addonRecipeIds: [] })
  })

  test('null base when the item has no base recipe', () => {
    const resolved = resolveConfiguredRecipeIds('m_none', ['opt_large'], [], recipes)
    expect(resolved.baseRecipeId).toBeNull()
  })

  test('composes end-to-end with computeConfiguredCost', () => {
    const flour = item({ id: 'flour', stock_unit_id: 'u_g', unit_cost: 0.05 })
    const cheese = item({ id: 'cheese', stock_unit_id: 'u_g', unit_cost: 0.3 })
    const components = [
      comp({ recipe_id: 'base', inventory_item_id: 'flour', quantity: 100, unit_id: 'u_g' }), // ₱5
      comp({ recipe_id: 'optL', inventory_item_id: 'flour', quantity: 100, unit_id: 'u_g' }), // +₱5
      comp({ recipe_id: 'addC', inventory_item_id: 'cheese', quantity: 20, unit_id: 'u_g' }), // +₱6
    ]
    const graph = buildCostingGraph([gramRow], [flour, cheese], recipes, components)
    const resolved = resolveConfiguredRecipeIds('m1', ['opt_large'], ['addon_cheese'], recipes)
    expect(computeConfiguredCost(resolved, graph)).toBeCloseTo(16, 6)
  })
})

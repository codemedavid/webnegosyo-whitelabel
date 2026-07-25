/**
 * Costing read path: load a tenant's inventory rows once, project them into the
 * pure CostingGraph, and cost one menu item's targets against it.
 *
 * The row fetch is injectable (mirroring TenantOrderWriteDeps in
 * tenant-supabase-orders.ts) so the assembly and error handling are testable
 * without a Supabase client.
 */

import { describe, it, expect, jest } from '@jest/globals'
import {
  getCostingGraph,
  getMenuItemCost,
  type CostingRowSets,
} from '@/lib/inventory/costing-service'
import type { InventoryItem, InventoryUnitRow, Recipe, RecipeComponent } from '@/types/database'

const GRAM: InventoryUnitRow = {
  id: 'u_g', tenant_id: 't1', name: 'Gram', abbreviation: 'g', dimension: 'weight',
  to_base_factor: 1, is_base: true, is_active: true, created_at: '', updated_at: '',
}

const FLOUR: InventoryItem = {
  id: 'flour', tenant_id: 't1', name: 'Flour', sku: null, category: null,
  stock_unit_id: 'u_g', unit_cost: 0.05, is_prep: false, image_url: null,
  current_qty: 0, reorder_level: 0, is_active: true, created_at: '', updated_at: '',
}

const BASE_RECIPE: Recipe = {
  id: 'r_base', tenant_id: 't1', target_type: 'menu_item', menu_item_id: 'm1',
  variation_option_id: null, addon_id: null, modifier_option_id: null, prep_item_id: null,
  yield_quantity: null, yield_unit_id: null, notes: null, created_at: '', updated_at: '',
}

const BASE_COMPONENT: RecipeComponent = {
  id: 'c1', tenant_id: 't1', recipe_id: 'r_base', inventory_item_id: 'flour',
  quantity: 100, unit_id: 'u_g', sort_order: 0, created_at: '', updated_at: '',
}

const EMPTY_ROWS: CostingRowSets = { units: [], items: [], recipes: [], components: [] }

function depsReturning(rows: CostingRowSets) {
  return { fetchCostingRows: jest.fn(async () => rows) }
}

describe('getCostingGraph', () => {
  it('projects the tenant rows into a graph the costing core can price', async () => {
    const deps = depsReturning({
      units: [GRAM], items: [FLOUR], recipes: [BASE_RECIPE], components: [BASE_COMPONENT],
    })

    const graph = await getCostingGraph('t1', deps)

    expect(graph.ingredients.flour).toBeDefined()
    expect(graph.recipes.r_base.components).toHaveLength(1)
    expect(deps.fetchCostingRows).toHaveBeenCalledWith('t1')
  })

  it('returns an empty graph for a tenant with no inventory yet', async () => {
    const graph = await getCostingGraph('t1', depsReturning(EMPTY_ROWS))

    expect(graph.ingredients).toEqual({})
    expect(graph.recipes).toEqual({})
  })
})

describe('getMenuItemCost', () => {
  it('costs the item base recipe from the loaded rows', async () => {
    const deps = depsReturning({
      units: [GRAM], items: [FLOUR], recipes: [BASE_RECIPE], components: [BASE_COMPONENT],
    })

    const breakdown = await getMenuItemCost('t1', 'm1', deps)

    expect(breakdown.baseCost).toBeCloseTo(5, 6)
    expect(breakdown.errors).toEqual([])
  })

  it('reports a null base cost for an item with no recipes', async () => {
    const deps = depsReturning({
      units: [GRAM], items: [FLOUR], recipes: [BASE_RECIPE], components: [BASE_COMPONENT],
    })

    const breakdown = await getMenuItemCost('t1', 'other-item', deps)

    expect(breakdown.baseCost).toBeNull()
    expect(breakdown.errors).toEqual([])
  })

  it('fetches the tenant rows only once per call', async () => {
    const deps = depsReturning(EMPTY_ROWS)

    await getMenuItemCost('t1', 'm1', deps)

    expect(deps.fetchCostingRows).toHaveBeenCalledTimes(1)
  })

  it('surfaces a broken recipe as an error rather than throwing', async () => {
    // Component references an ingredient that is not in the item rows.
    const deps = depsReturning({
      units: [GRAM], items: [], recipes: [BASE_RECIPE], components: [BASE_COMPONENT],
    })

    const breakdown = await getMenuItemCost('t1', 'm1', deps)

    expect(breakdown.baseCost).toBeNull()
    expect(breakdown.errors).toHaveLength(1)
  })

  it('propagates a fetch failure instead of reporting a false zero cost', async () => {
    const deps = {
      fetchCostingRows: jest.fn(async () => {
        throw new Error('connection refused')
      }),
    }

    await expect(getMenuItemCost('t1', 'm1', deps)).rejects.toThrow('connection refused')
  })
})

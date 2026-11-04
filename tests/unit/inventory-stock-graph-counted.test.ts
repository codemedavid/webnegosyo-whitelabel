/**
 * The stock graph (checkout guard + storefront/register ceilings) judges only
 * COUNTED shelves, and leaves a "sell anyway" dish unlimited (2026-11-03).
 *
 * Industry rule: tracking starts at the first recorded quantity. A store that
 * set up recipes before its opening count had every dish refused online over
 * ingredients nobody had counted — while auto-86 left the same dishes on the
 * menu. Both now read the same `judged-shelf.ts` rule.
 */

import { fakeSupabaseTables } from '../fixtures/fake-supabase-tables'

let tables: Record<string, object[]> = {}
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => fakeSupabaseTables(tables).client,
}))

const T = 't1'
const NOW = new Date('2026-11-03T04:00:00.000Z')
const COUNTED = '2026-10-01T00:00:00.000Z'

function seed(overrides: Partial<Record<string, object[]>> = {}) {
  tables = {
    tenants: [{ id: T, inventory_enabled: true }],
    recipes: [
      { id: 'r1', tenant_id: T, target_type: 'menu_item', menu_item_id: 'latte', variation_option_id: null, addon_id: null, modifier_option_id: null },
    ],
    recipe_components: [
      { id: 'c1', tenant_id: T, recipe_id: 'r1', inventory_item_id: 'milk', quantity: 1, unit_id: 'pc' },
      { id: 'c2', tenant_id: T, recipe_id: 'r1', inventory_item_id: 'straw', quantity: 1, unit_id: 'pc' },
    ],
    inventory_items: [
      { id: 'milk', tenant_id: T, name: 'Milk', stock_unit_id: 'pc', current_qty: 3, is_active: true, counted_at: COUNTED },
      { id: 'straw', tenant_id: T, name: 'Straw', stock_unit_id: 'pc', current_qty: -56, is_active: true, counted_at: null },
    ],
    inventory_units: [{ id: 'pc', tenant_id: T, name: 'piece', abbreviation: 'pc', dimension: 'count', to_base_factor: 1 }],
    inventory_stock: [],
    menu_items: [{ id: 'latte', tenant_id: T, name: 'Iced Latte', modifier_groups: null, auto_86_snoozed_until: null }],
    ...overrides,
  }
}

async function load() {
  return import('@/lib/inventory/stock-graph-read')
}

it('leaves an ingredient nobody counted off the judged shelf', async () => {
  seed()
  const { readTenantStockGraph } = await load()

  const graph = await readTenantStockGraph(T, null, NOW)

  expect(graph?.shelf.map((item) => item.id)).toEqual(['milk'])
})

it('judges a branch only on shelves counted AT that branch', async () => {
  seed({
    inventory_stock: [
      { id: 's1', tenant_id: T, inventory_item_id: 'milk', outlet_id: 'north', current_qty: 4, counted_at: COUNTED },
      // Created by a sale (no count here yet): ignorance, not an empty shelf.
      { id: 's2', tenant_id: T, inventory_item_id: 'milk', outlet_id: 'south', current_qty: -1, counted_at: null },
    ],
  })
  const { readTenantStockGraph } = await load()

  expect((await readTenantStockGraph(T, 'north', NOW))?.shelf).toEqual([
    expect.objectContaining({ id: 'milk', current_qty: 4 }),
  ])
  expect((await readTenantStockGraph(T, 'south', NOW))?.shelf).toEqual([])
})

it('drops every recipe of a dish the owner chose to "sell anyway", until that runs out', async () => {
  seed({
    menu_items: [{ id: 'latte', tenant_id: T, name: 'Iced Latte', modifier_groups: null, auto_86_snoozed_until: '2026-11-03T16:00:00.000Z' }],
  })
  const { readTenantStockGraph } = await load()

  expect((await readTenantStockGraph(T, null, NOW))?.recipes).toEqual([])
  expect((await readTenantStockGraph(T, null, new Date('2026-11-03T17:00:00.000Z')))?.recipes).toHaveLength(1)
})

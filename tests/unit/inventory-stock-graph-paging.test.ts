/**
 * The stock graph behind the checkout guard and the storefront ceilings must
 * read past PostgREST's 1000-row cap. Unpaged, a big store's 1001st recipe line
 * simply did not exist: its dish read as untracked and was never capped.
 */

import { readTenantStockGraph } from '@/lib/inventory/stock-graph-read'

const ROWS: Record<string, Array<Record<string, unknown>>> = {}

function pagedTable(name: string) {
  let range: [number, number] | null = null
  let wantsCount = false
  const chain: Record<string, unknown> = {}
  chain.select = (_columns: string, options?: { count?: string }) => {
    wantsCount = options?.count === 'exact'
    return chain
  }
  chain.eq = () => chain
  chain.order = () => chain
  chain.maybeSingle = () => Promise.resolve({ data: ROWS[name]?.[0] ?? null, error: null })
  chain.range = (from: number, to: number) => {
    range = [from, to]
    return chain
  }
  chain.then = (resolve: (value: unknown) => unknown) => {
    const all = ROWS[name] ?? []
    // PostgREST's max-rows: never more than 1000 in one response.
    const [from, to] = range ?? [0, all.length - 1]
    const data = all.slice(from, Math.min(to + 1, from + 1000))
    return Promise.resolve({ data, error: null, count: wantsCount ? all.length : null }).then(resolve)
  }
  return chain
}

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (name: string) => pagedTable(name) }),
}))

beforeEach(() => {
  const components = Array.from({ length: 1500 }, (_, index) => ({
    id: `c-${String(index).padStart(5, '0')}`,
    recipe_id: `r-${index}`,
    inventory_item_id: 'flour',
    quantity: 1,
    unit_id: 'g',
  }))
  Object.assign(ROWS, {
    tenants: [{ inventory_enabled: true }],
    recipes: components.map((component, index) => ({
      id: component.recipe_id, target_type: 'menu_item', menu_item_id: `m-${index}`,
    })),
    recipe_components: components,
    inventory_items: [{ id: 'flour', name: 'Flour', stock_unit_id: 'g', current_qty: 10, is_active: true }],
    inventory_units: [{ id: 'g', name: 'Gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 }],
    inventory_stock: [],
    menu_items: [],
  })
})

it('reads every recipe line past the 1000-row cap', async () => {
  const graph = await readTenantStockGraph('t1')

  expect(graph?.components).toHaveLength(1500)
  expect(graph?.recipes).toHaveLength(1500)
})

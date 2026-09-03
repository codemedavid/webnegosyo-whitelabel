/**
 * Every dish's producible ceiling, in one read, for the storefront.
 *
 * The stepper cap needs a ceiling per dish, not per cart. This is that read —
 * and it is deliberately the SAME read the checkout guard runs
 * (`stock-graph-read.ts`), so the number a customer is shown and the number
 * they are refused by cannot drift apart.
 *
 * Untracked dishes are ABSENT from the result rather than present with some
 * sentinel. A ceiling map that answers "no entry" for both "unlimited" and
 * "unknown" is the only shape that cannot be misread as zero by a caller that
 * forgets to check.
 */

import { getMenuStockCeilings } from '@/lib/inventory/menu-ceilings'

const from = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (...a: unknown[]) => from(...a) }),
}))

function table(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve({ data, error }),
    maybeSingle: () => Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error }),
  }
  for (const method of ['select', 'eq', 'is', 'in', 'order', 'limit']) {
    chain[method] = () => chain
  }
  return chain
}

const GRAM = { id: 'unit-gram', name: 'Gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 }
const PIZZA_RECIPE = { id: 'r-pizza', target_type: 'menu_item', menu_item_id: 'm-pizza' }
const PIZZA_COMPONENT = {
  recipe_id: 'r-pizza', inventory_item_id: 'ing-flour', quantity: 200, unit_id: 'unit-gram',
}
const FLOUR = {
  id: 'ing-flour', name: 'Flour', stock_unit_id: 'unit-gram', current_qty: 1000, is_active: true,
}

interface WireOptions {
  tenant?: unknown
  recipes?: unknown[]
  components?: unknown[]
  items?: unknown[]
  branchStock?: unknown[]
  error?: unknown
}

function wire(options: WireOptions = {}) {
  const tables: Record<string, unknown> = {
    tenants: table(options.tenant ?? { inventory_enabled: true }, options.error),
    recipes: table(options.recipes ?? [PIZZA_RECIPE], options.error),
    recipe_components: table(options.components ?? [PIZZA_COMPONENT], options.error),
    inventory_items: table(options.items ?? [FLOUR], options.error),
    inventory_units: table([GRAM], options.error),
    inventory_stock: table(options.branchStock ?? [], options.error),
    menu_items: table([{ id: 'm-pizza', name: 'Margherita' }], options.error),
  }
  from.mockImplementation((name: string) => tables[name] ?? table([]))
}

beforeEach(() => jest.clearAllMocks())

describe('getMenuStockCeilings', () => {
  it('reports how many of each tracked dish the shelf can make', async () => {
    wire() // 1000 g of flour, 200 g per pizza.

    const ceilings = await getMenuStockCeilings('t1')

    expect(ceilings.get('m-pizza')).toBe(5)
  })

  it('leaves an untracked dish out of the map entirely', async () => {
    wire()

    const ceilings = await getMenuStockCeilings('t1')

    expect(ceilings.has('m-uncosted')).toBe(false)
  })

  it('reports zero for a dish whose ingredient is exhausted', async () => {
    wire({ items: [{ ...FLOUR, current_qty: 0 }] })

    const ceilings = await getMenuStockCeilings('t1')

    expect(ceilings.get('m-pizza')).toBe(0)
  })

  it('is empty when the tenant has not turned inventory on', async () => {
    wire({ tenant: { inventory_enabled: false } })

    const ceilings = await getMenuStockCeilings('t1')

    expect(ceilings.size).toBe(0)
    expect(from).not.toHaveBeenCalledWith('recipes')
  })

  it('is empty when the read fails — no ceiling beats a wrong ceiling', async () => {
    wire({ error: { message: 'boom' } })

    const ceilings = await getMenuStockCeilings('t1')

    expect(ceilings.size).toBe(0)
  })

  it('does not let an addon or prep recipe put a ceiling on a dish', async () => {
    // Only a base recipe constrains, matching auto-86: an ingredient used
    // solely by an addon leaves the dish sellable in its other configurations.
    wire({
      recipes: [{ id: 'r-addon', target_type: 'addon', menu_item_id: 'm-pizza' }],
      components: [{ ...PIZZA_COMPONENT, recipe_id: 'r-addon' }],
    })

    const ceilings = await getMenuStockCeilings('t1')

    expect(ceilings.has('m-pizza')).toBe(false)
  })

  it('ignores a base recipe attached to no dish', async () => {
    wire({ recipes: [{ id: 'r-orphan', target_type: 'menu_item', menu_item_id: null }] })

    const ceilings = await getMenuStockCeilings('t1')

    expect(ceilings.size).toBe(0)
  })

  it('uses the branch’s own shelf when a branch is named', async () => {
    wire({
      branchStock: [
        { inventory_item_id: 'ing-flour', outlet_id: 'branch-1', current_qty: 400 },
      ],
    })

    const ceilings = await getMenuStockCeilings('t1', 'branch-1')

    expect(ceilings.get('m-pizza')).toBe(2)
  })
})

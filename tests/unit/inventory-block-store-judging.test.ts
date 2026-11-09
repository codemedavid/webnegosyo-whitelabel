/**
 * A store set to block (`pos_stock_policy = 'block'`) judges EVERY shelf: an
 * ingredient at or below zero is out, counted or not (owner, 2026-11-07, after
 * dishes at -5 sold with no prompt at SofiasKitchen). Every other store keeps
 * the rule that tracking starts at the first recorded quantity.
 */

import { fakeSupabaseTables } from '../fixtures/fake-supabase-tables'
import { toJudgedShelf, judgesUncounted } from '@/lib/inventory/judged-shelf'
import { detectOutAgain } from '@/lib/inventory/low-stock'
import { findDishStockBlockers } from '@/lib/inventory/dish-availability'
import type { Recipe, RecipeComponent } from '@/types/database'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'

let tables: Record<string, object[]> = {}
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => fakeSupabaseTables(tables).client,
}))

const T = 't1'
const NOW = new Date('2026-11-07T04:00:00.000Z')
const PC = { id: 'pc', tenant_id: T, name: 'piece', abbreviation: 'pc', dimension: 'count', to_base_factor: 1 }
const RECIPE = { id: 'r1', tenant_id: T, target_type: 'menu_item', menu_item_id: 'ribs', variation_option_id: null, addon_id: null, modifier_option_id: null }
const LINE = { id: 'c1', tenant_id: T, recipe_id: 'r1', inventory_item_id: 'pork', quantity: 1, unit_id: 'pc' }

function seed(policy: string, qty: number, overrides: Partial<Record<string, object[]>> = {}) {
  tables = {
    tenants: [{ id: T, inventory_enabled: true, pos_stock_policy: policy }],
    recipes: [RECIPE],
    recipe_components: [LINE],
    inventory_items: [{ id: 'pork', tenant_id: T, name: 'Pork', stock_unit_id: 'pc', current_qty: qty, is_active: true, counted_at: null }],
    inventory_units: [PC],
    inventory_stock: [],
    menu_items: [{ id: 'ribs', tenant_id: T, name: 'Ribs', modifier_groups: null, is_available: true, auto_disabled_at: null, auto_86_snoozed_until: null }],
    ...overrides,
  }
}

/** Reads from the fake; UPDATE ... RETURNING id answers with the ids it was given. */
function writableClient() {
  const fake = fakeSupabaseTables(tables)
  const from = (table: string) => ({
    ...fake.client.from(table),
    update() {
      let ids: string[] = []
      const builder = {
        eq: () => builder,
        not: () => builder,
        in: (column: string, values: string[]) => {
          if (column === 'id') ids = values
          return builder
        },
        select: () => Promise.resolve({ data: ids.map((id) => ({ id })), error: null }),
      }
      return builder
    },
  })
  return { from } as never
}

describe('judgesUncounted', () => {
  it('is true only for the exact block policy', () => {
    expect(judgesUncounted('block')).toBe(true)
    expect(judgesUncounted('warn')).toBe(false)
    expect(judgesUncounted(null)).toBe(false)
    expect(judgesUncounted(undefined)).toBe(false)
  })
})

describe('toJudgedShelf', () => {
  const units = new Map([['pc', PC as unknown as InventoryUnit]])
  const row = { id: 'pork', stock_unit_id: 'pc', current_qty: 0, is_active: true, counted_at: null }

  it('leaves a never-counted row off by default', () => {
    expect(toJudgedShelf([row], units)).toEqual([])
  })

  it('keeps a never-counted row when told to judge it', () => {
    expect(toJudgedShelf([row], units, { judgeUncounted: true })).toEqual([
      expect.objectContaining({ id: 'pork', current_qty: 0 }),
    ])
  })
})

describe('readTenantStockGraph', () => {
  const load = () => import('@/lib/inventory/stock-graph-read')

  it.each([0, -5])('judges a never-counted ingredient at %d on a block store', async (qty) => {
    seed('block', qty)
    const { readTenantStockGraph } = await load()
    const graph = await readTenantStockGraph(T, null, NOW)
    expect(graph?.shelf).toEqual([expect.objectContaining({ id: 'pork', current_qty: qty })])
  })

  it('still ignores a never-counted ingredient on a warn store', async () => {
    seed('warn', -5)
    const { readTenantStockGraph } = await load()
    expect((await readTenantStockGraph(T, null, NOW))?.shelf).toEqual([])
  })

  it('judges a branch shelf with no count, and no row as zero, on a block store', async () => {
    seed('block', 9, {
      inventory_stock: [{ id: 's1', tenant_id: T, inventory_item_id: 'pork', outlet_id: 'north', current_qty: -2, counted_at: null }],
    })
    const { readTenantStockGraph } = await load()
    expect((await readTenantStockGraph(T, 'north', NOW))?.shelf).toEqual([expect.objectContaining({ current_qty: -2 })])
    expect((await readTenantStockGraph(T, 'south', NOW))?.shelf).toEqual([expect.objectContaining({ current_qty: 0 })])
  })

  it('gives a dish a limit of 0 end to end on a block store', async () => {
    seed('block', -5)
    const { getMenuStockAvailability } = await import('@/lib/inventory/menu-ceilings')
    const { dishes } = await getMenuStockAvailability(T, null)
    expect(dishes.get('ribs')).toBe(0)
  })
})

describe('reconcileAuto86 and reconcileWholeMenu', () => {
  const load = () => import('@/lib/inventory/auto-86-service')

  it('hides a dish over a never-counted empty ingredient when judging uncounted', async () => {
    seed('block', 0)
    const { reconcileAuto86 } = await load()
    const result = await reconcileAuto86(writableClient(), T, ['pork'], NOW, { judgeUncounted: true })
    expect(result.disabled).toEqual(['ribs'])
  })

  it('leaves the dish alone without the option', async () => {
    seed('warn', 0)
    const { reconcileAuto86 } = await load()
    expect((await reconcileAuto86(writableClient(), T, ['pork'], NOW)).disabled).toEqual([])
  })

  it('checks every dish with a recipe, with no ingredient having moved', async () => {
    seed('block', -1)
    const { reconcileWholeMenu } = await load()
    expect((await reconcileWholeMenu(writableClient(), T, NOW, { judgeUncounted: true })).disabled).toEqual(['ribs'])
  })

  it('returns a dish this system hid once the store stops judging uncounted', async () => {
    seed('warn', -1, {
      menu_items: [{ id: 'ribs', tenant_id: T, name: 'Ribs', is_available: false, auto_disabled_at: NOW.toISOString(), auto_86_snoozed_until: null }],
    })
    const { reconcileWholeMenu } = await load()
    expect((await reconcileWholeMenu(writableClient(), T, NOW)).reEnabled).toEqual(['ribs'])
  })
})

describe('findDishStockBlockers', () => {
  it('names a never-counted empty ingredient only when judging uncounted', () => {
    const ingredient = { id: 'pork', name: 'Pork', stock_unit_id: 'pc', current_qty: 0, is_active: true, counted_at: null }
    const args = ['ribs', [RECIPE as unknown as Recipe], [LINE as unknown as RecipeComponent], [ingredient], [PC as unknown as InventoryUnit]] as const
    expect(findDishStockBlockers(...args)).toEqual([])
    expect(findDishStockBlockers(...args, { judgeUncounted: true })).toEqual([
      expect.objectContaining({ ingredientId: 'pork', onHand: 0 }),
    ])
  })
})

describe('detectOutAgain', () => {
  const pork = { id: 'pork', name: 'Pork', current_qty: 0, reorder_level: 0, is_active: true }

  it('reports a sale that takes an already-empty ingredient lower', () => {
    expect(detectOutAgain([pork], new Map([['pork', -1]]))).toEqual([
      expect.objectContaining({ itemId: 'pork', from: 'out', to: 'out', quantity: -1 }),
    ])
  })

  it('ignores upward moves, a count of zero, stocked and archived ingredients', () => {
    expect(detectOutAgain([{ ...pork, current_qty: -3 }], new Map([['pork', 1]]))).toEqual([])
    expect(detectOutAgain([pork], new Map([['pork', 0]]))).toEqual([])
    expect(detectOutAgain([{ ...pork, current_qty: 5 }], new Map([['pork', -1]]))).toEqual([])
    expect(detectOutAgain([{ ...pork, is_active: false }], new Map([['pork', -1]]))).toEqual([])
  })
})

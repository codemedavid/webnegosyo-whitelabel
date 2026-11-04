/**
 * Turning a dish back on while its stock reads empty (2026-11-03).
 *
 * The Lolys incident: auto-86 hid six egg dishes, a person turned them back on
 * an hour later with no word about why they were off, and they sold Egg below
 * zero. Square and Uber Eats answer this with "sold out for today": here the
 * owner is asked "Egg shows 0 — record a count, or sell anyway until end of
 * day?" and "sell anyway" holds back auto-86 and the stock limits until the
 * business day ends.
 */

import { fakeSupabaseTables } from '../fixtures/fake-supabase-tables'

const NOW = new Date('2026-11-03T04:00:00.000Z') // 12:00 Manila
const T = 'aaaaaaaa-0000-4000-8000-000000000001'
const COUNTED = '2026-10-01T00:00:00.000Z'

function graph(overrides: Partial<Record<string, object[]>> = {}): Record<string, object[]> {
  return {
    recipes: [{ id: 'r1', tenant_id: T, target_type: 'menu_item', menu_item_id: 'chicken', variation_option_id: null, addon_id: null, modifier_option_id: null }],
    recipe_components: [
      { id: 'c1', tenant_id: T, recipe_id: 'r1', inventory_item_id: 'egg', quantity: 1, unit_id: 'pc' },
      { id: 'c2', tenant_id: T, recipe_id: 'r1', inventory_item_id: 'rice', quantity: 1, unit_id: 'pc' },
      { id: 'c3', tenant_id: T, recipe_id: 'r1', inventory_item_id: 'straw', quantity: 1, unit_id: 'pc' },
    ],
    inventory_items: [
      { id: 'egg', tenant_id: T, name: 'Egg', stock_unit_id: 'pc', current_qty: -1, is_active: true, counted_at: COUNTED },
      { id: 'rice', tenant_id: T, name: 'Rice', stock_unit_id: 'pc', current_qty: 20, is_active: true, counted_at: COUNTED },
      { id: 'straw', tenant_id: T, name: 'Straw', stock_unit_id: 'pc', current_qty: -56, is_active: true, counted_at: null },
    ],
    inventory_units: [{ id: 'pc', tenant_id: T, name: 'piece', abbreviation: 'pc', dimension: 'count', to_base_factor: 1 }],
    ...overrides,
  }
}

async function load() {
  return import('@/lib/inventory/dish-availability')
}

describe('readDishStockBlockers', () => {
  it('names only the counted base ingredients that cannot cover one serving', async () => {
    const { readDishStockBlockers } = await load()
    const { client } = fakeSupabaseTables(graph())

    expect(await readDishStockBlockers(client, T, 'chicken')).toEqual([
      { ingredientId: 'egg', name: 'Egg', onHand: -1, unit: 'pc' },
    ])
  })

  it('has nothing to say about a dish with no recipe', async () => {
    const { readDishStockBlockers } = await load()
    const { client } = fakeSupabaseTables(graph())

    expect(await readDishStockBlockers(client, T, 'water')).toEqual([])
  })

  it('throws on a failed read rather than reporting "nothing missing"', async () => {
    const { readDishStockBlockers } = await load()
    const { client } = fakeSupabaseTables(graph(), { inventory_items: 'boom' })

    await expect(readDishStockBlockers(client, T, 'chicken')).rejects.toThrow()
  })
})

describe('sellAnywayUntil', () => {
  it('lasts until the store’s business day ends (Manila midnight by default)', async () => {
    const { sellAnywayUntil } = await load()
    const { client } = fakeSupabaseTables({ business_day_cutoffs: [] })

    expect(await sellAnywayUntil(client, T, NOW)).toBe('2026-11-03T16:00:00.000Z')
  })

  it('follows a late-night cutoff (2 AM)', async () => {
    const { sellAnywayUntil } = await load()
    const { client } = fakeSupabaseTables({
      business_day_cutoffs: [{ tenant_id: T, effective_from: '2026-10-01', cutoff_minutes: 120 }],
    })

    expect(await sellAnywayUntil(client, T, NOW)).toBe('2026-11-03T18:00:00.000Z')
  })
})

describe('decideDishAvailabilityWrite', () => {
  it('asks first when turning on a dish that cannot be made', async () => {
    const { decideDishAvailabilityWrite } = await load()
    const blockers = [{ ingredientId: 'egg', name: 'Egg', onHand: 0, unit: 'pc' }]

    expect(decideDishAvailabilityWrite({ isAvailable: true, sellAnyway: false, blockers, sellAnywayUntil: 'X' })).toEqual({
      kind: 'confirm',
      blockers,
      sellAnywayUntil: 'X',
    })
  })

  it('turns it on until end of day when the owner chose "sell anyway"', async () => {
    const { decideDishAvailabilityWrite } = await load()
    const blockers = [{ ingredientId: 'egg', name: 'Egg', onHand: 0, unit: 'pc' }]

    expect(decideDishAvailabilityWrite({ isAvailable: true, sellAnyway: true, blockers, sellAnywayUntil: 'X' })).toEqual({
      kind: 'write',
      patch: { is_available: true, auto_disabled_at: null, auto_86_snoozed_until: 'X' },
    })
  })

  it('turns on a dish that can be made with no override', async () => {
    const { decideDishAvailabilityWrite } = await load()

    expect(decideDishAvailabilityWrite({ isAvailable: true, sellAnyway: true, blockers: [], sellAnywayUntil: 'X' })).toEqual({
      kind: 'write',
      patch: { is_available: true, auto_disabled_at: null, auto_86_snoozed_until: null },
    })
  })

  it('turning off always clears an override and hands the dish back to the owner', async () => {
    const { decideDishAvailabilityWrite } = await load()

    expect(decideDishAvailabilityWrite({ isAvailable: false, sellAnyway: false, blockers: [], sellAnywayUntil: 'X' })).toEqual({
      kind: 'write',
      patch: { is_available: false, auto_disabled_at: null, auto_86_snoozed_until: null },
    })
  })
})

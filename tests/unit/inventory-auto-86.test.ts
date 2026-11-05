/**
 * Auto-86 decides on the LEVEL, not the crossing (2026-11-03).
 *
 * The old rule hid a dish only on the movement that carried an ingredient
 * INTO "out". An ingredient that was already out never crossed again, so a
 * dish turned back on by hand over an empty shelf stayed on sale forever, and
 * an ingredient that started at zero never hid anything. Lavu's "track 86 by
 * inventory item level" is the model: after any stock change, a dish that
 * cannot be made even once is off; a dish this system hid comes back once it
 * can be made again.
 *
 * Unchanged rules:
 *   - only the BASE recipe can 86 a dish (an option-only ingredient leaves the
 *     dish sellable in its other configurations);
 *   - only a dish this system hid (auto_disabled_at) is ever put back.
 * New rules:
 *   - an ingredient nobody ever counted has no limit (the caller drops it
 *     from the shelf; here an absent ingredient is "unjudgeable");
 *   - "sell anyway until end of day" (auto_86_snoozed_until in the future)
 *     keeps the dish on sale.
 */

import { decideAuto86, type Auto86Dish } from '@/lib/inventory/auto-86'
import type { ProducibleStock } from '@/lib/inventory/producible'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'
import type { Recipe, RecipeComponent } from '@/types/database'

const NOW = Date.parse('2026-11-03T04:00:00.000Z')

const PIECE: InventoryUnit = { id: 'unit-pc', name: 'piece', abbreviation: 'pc', dimension: 'count', to_base_factor: 1 }
const GRAM: InventoryUnit = { id: 'unit-g', name: 'gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 }
const KILO: InventoryUnit = { id: 'unit-kg', name: 'kilogram', abbreviation: 'kg', dimension: 'weight', to_base_factor: 1000 }
const UNITS = [PIECE, GRAM, KILO]

function recipe(overrides: Partial<Recipe> & Pick<Recipe, 'id'>): Recipe {
  return {
    tenant_id: 'tenant-1',
    target_type: 'menu_item',
    menu_item_id: 'menu-1',
    variation_option_id: null,
    modifier_option_id: null,
    addon_id: null,
    prep_item_id: null,
    yield_quantity: null,
    yield_unit_id: null,
    ...overrides,
  } as Recipe
}

function component(recipeId: string, inventoryItemId: string, quantity = 1, unitId = 'unit-pc'): RecipeComponent {
  return {
    id: `${recipeId}-${inventoryItemId}`,
    tenant_id: 'tenant-1',
    recipe_id: recipeId,
    inventory_item_id: inventoryItemId,
    quantity,
    unit_id: unitId,
    sort_order: 0,
  } as RecipeComponent
}

function shelf(id: string, qty: number, stockUnit: InventoryUnit = PIECE, isActive = true): ProducibleStock {
  return { id, current_qty: qty, is_active: isActive, stockUnit }
}

function dish(overrides: Partial<Auto86Dish> = {}): Auto86Dish {
  return { id: 'menu-1', is_available: true, auto_disabled_at: null, auto_86_snoozed_until: null, ...overrides }
}

const BASE = recipe({ id: 'r-base' })

describe('decideAuto86 — taking a dish off', () => {
  it('hides a dish whose base ingredient is empty', () => {
    const decision = decideAuto86([dish()], [BASE], [component('r-base', 'egg')], [shelf('egg', 0)], UNITS, NOW)
    expect(decision).toEqual({ disable: ['menu-1'], reEnable: [] })
  })

  it('hides it again when it was turned back on over a shelf that is still empty (the Lolys case)', () => {
    // Egg sits at -1 after a sale; the dish is on sale with no marker because
    // a person turned it back on. Nothing "crossed" — the level still says out.
    const decision = decideAuto86([dish()], [BASE], [component('r-base', 'egg')], [shelf('egg', -1)], UNITS, NOW)
    expect(decision.disable).toEqual(['menu-1'])
  })

  it('hides a dish when what is left is less than one serving', () => {
    // 50 g left, a serving needs 0.08 kg = 80 g: "can make 0".
    const decision = decideAuto86(
      [dish()],
      [BASE],
      [component('r-base', 'chicken', 0.08, 'unit-kg')],
      [shelf('chicken', 50, GRAM)],
      UNITS,
      NOW,
    )
    expect(decision.disable).toEqual(['menu-1'])
  })

  it('keeps a dish on sale while one serving can still be made', () => {
    const decision = decideAuto86([dish()], [BASE], [component('r-base', 'egg')], [shelf('egg', 1)], UNITS, NOW)
    expect(decision).toEqual({ disable: [], reEnable: [] })
  })

  it('ignores an ingredient that is not on the judged shelf (never counted, inactive or unknown)', () => {
    const decision = decideAuto86([dish()], [BASE], [component('r-base', 'straw')], [], UNITS, NOW)
    expect(decision.disable).toEqual([])
  })

  it('ignores an inactive ingredient even at zero', () => {
    const decision = decideAuto86([dish()], [BASE], [component('r-base', 'egg')], [shelf('egg', 0, PIECE, false)], UNITS, NOW)
    expect(decision.disable).toEqual([])
  })

  it('never hides a dish over an ingredient only an option or add-on uses', () => {
    const option = recipe({ id: 'r-opt', target_type: 'modifier_option', modifier_option_id: 'opt-pearls' })
    const decision = decideAuto86([dish()], [BASE, option], [component('r-opt', 'pearls')], [shelf('pearls', 0)], UNITS, NOW)
    expect(decision.disable).toEqual([])
  })

  it('leaves a dish on sale while the owner chose "sell anyway" until later today', () => {
    const snoozed = dish({ auto_86_snoozed_until: '2026-11-03T16:00:00.000Z' })
    const decision = decideAuto86([snoozed], [BASE], [component('r-base', 'egg')], [shelf('egg', 0)], UNITS, NOW)
    expect(decision.disable).toEqual([])
  })

  it('hides it once that "sell anyway" has run out', () => {
    const expired = dish({ auto_86_snoozed_until: '2026-11-02T16:00:00.000Z' })
    const decision = decideAuto86([expired], [BASE], [component('r-base', 'egg')], [shelf('egg', 0)], UNITS, NOW)
    expect(decision.disable).toEqual(['menu-1'])
  })

  it('does not re-hide a dish that is already off', () => {
    const off = dish({ is_available: false, auto_disabled_at: '2026-11-03T01:00:00.000Z' })
    const decision = decideAuto86([off], [BASE], [component('r-base', 'egg')], [shelf('egg', 0)], UNITS, NOW)
    expect(decision).toEqual({ disable: [], reEnable: [] })
  })

  it('leaves a dish with no base recipe alone', () => {
    const decision = decideAuto86([dish({ id: 'menu-2' })], [BASE], [component('r-base', 'egg')], [shelf('egg', 0)], UNITS, NOW)
    expect(decision.disable).toEqual([])
  })
})

describe('decideAuto86 — putting a dish back', () => {
  const hidden = dish({ is_available: false, auto_disabled_at: '2026-11-03T01:00:00.000Z' })

  it('puts back a dish this system hid once a serving can be made again', () => {
    const decision = decideAuto86([hidden], [BASE], [component('r-base', 'egg')], [shelf('egg', 12)], UNITS, NOW)
    expect(decision).toEqual({ disable: [], reEnable: ['menu-1'] })
  })

  it('keeps it off while ANOTHER base ingredient is still empty (flour back, sugar not)', () => {
    const decision = decideAuto86(
      [hidden],
      [BASE],
      [component('r-base', 'flour'), component('r-base', 'sugar')],
      [shelf('flour', 10), shelf('sugar', 0)],
      UNITS,
      NOW,
    )
    expect(decision.reEnable).toEqual([])
  })

  it('keeps it off while the delivery covers less than one serving', () => {
    const decision = decideAuto86(
      [hidden],
      [BASE],
      [component('r-base', 'chicken', 0.08, 'unit-kg')],
      [shelf('chicken', 30, GRAM)],
      UNITS,
      NOW,
    )
    expect(decision.reEnable).toEqual([])
  })

  it('never puts back a dish the merchant turned off themselves', () => {
    const merchantOff = dish({ is_available: false, auto_disabled_at: null })
    const decision = decideAuto86([merchantOff], [BASE], [component('r-base', 'egg')], [shelf('egg', 12)], UNITS, NOW)
    expect(decision.reEnable).toEqual([])
  })

  it('puts back a hidden dish whose limiting ingredient is no longer judged (e.g. deactivated)', () => {
    const decision = decideAuto86([hidden], [BASE], [component('r-base', 'egg')], [], UNITS, NOW)
    expect(decision.reEnable).toEqual(['menu-1'])
  })
})

describe('decideAuto86 — many dishes', () => {
  it('decides each dish on its own recipe, in input order', () => {
    const second = recipe({ id: 'r-2', menu_item_id: 'menu-2' })
    const third = recipe({ id: 'r-3', menu_item_id: 'menu-3' })
    const decision = decideAuto86(
      [
        dish({ id: 'menu-3' }),
        dish({ id: 'menu-2', is_available: false, auto_disabled_at: '2026-11-03T01:00:00.000Z' }),
        dish(),
      ],
      [BASE, second, third],
      [component('r-base', 'egg'), component('r-2', 'rice'), component('r-3', 'egg'), component('r-3', 'rice')],
      [shelf('egg', 0), shelf('rice', 5)],
      UNITS,
      NOW,
    )
    expect(decision).toEqual({ disable: ['menu-3', 'menu-1'], reEnable: ['menu-2'] })
  })
})

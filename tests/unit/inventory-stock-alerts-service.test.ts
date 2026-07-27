/**
 * Phase 5B — what happens after a movement crosses a line.
 *
 * Two behaviours share one entry point because they read the same crossings:
 * raising a low-stock alert, and taking an item off the menu when an ingredient
 * runs out. Both are per-tenant opt-in, and auto-86 in particular must stay off
 * until a merchant asks for it — silently hiding a bestseller is worse than
 * selling one portion short.
 */

import { processStockLevelChanges } from '@/lib/inventory/stock-alerts-service'
import type { InventoryItem } from '@/types/database'

const from = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (...a: unknown[]) => from(...a) }),
}))

/**
 * A chainable Supabase stub. Every builder method returns the same object and
 * the object is thenable, so it resolves the configured rows however long the
 * caller's chain is.
 */
function table(data: unknown[] | Record<string, unknown> = []) {
  const calls: Record<string, unknown[][]> = {}
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve({ data, error: null }),
    calls,
  }
  for (const method of ['select', 'eq', 'is', 'not', 'in', 'insert', 'update', 'single', 'limit']) {
    chain[method] = (...args: unknown[]) => {
      calls[method] = [...(calls[method] ?? []), args]
      return chain
    }
  }
  return chain as ReturnType<typeof jest.fn> & {
    calls: Record<string, unknown[][]>
  }
}

function ingredient(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'flour',
    tenant_id: 't1',
    name: 'Flour',
    current_qty: 25,
    reorder_level: 20,
    is_active: true,
    ...overrides,
  } as InventoryItem
}

interface Tables {
  tenants?: ReturnType<typeof table>
  stock_alerts?: ReturnType<typeof table>
  recipe_components?: ReturnType<typeof table>
  recipes?: ReturnType<typeof table>
  menu_items?: ReturnType<typeof table>
  inventory_items?: ReturnType<typeof table>
}

function wire(tables: Tables): Required<Tables> {
  const resolved = {
    tenants: tables.tenants ?? table({}),
    stock_alerts: tables.stock_alerts ?? table([]),
    recipe_components: tables.recipe_components ?? table([]),
    recipes: tables.recipes ?? table([]),
    menu_items: tables.menu_items ?? table([]),
    inventory_items: tables.inventory_items ?? table([]),
  }
  from.mockImplementation((name: keyof Tables) => resolved[name])
  return resolved
}

const FLAGS_ALL_ON = { low_stock_alerts_enabled: true, auto_86_enabled: true }
const FLAGS_ALL_OFF = { low_stock_alerts_enabled: false, auto_86_enabled: false }

beforeEach(() => {
  from.mockReset()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('processStockLevelChanges — alerts', () => {
  it('raises an alert when a movement takes an ingredient into low stock', async () => {
    const tables = wire({ tenants: table(FLAGS_ALL_ON) })

    const result = await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 25, reorder_level: 20 })],
      new Map([['flour', -10]]),
    )

    expect(result.alertsRaised).toBe(1)
    expect(tables.stock_alerts.calls.insert?.[0][0]).toEqual([
      expect.objectContaining({
        tenant_id: 't1',
        inventory_item_id: 'flour',
        level: 'low',
        quantity: 15,
      }),
    ])
  })

  it('does not raise an alert when the tenant has alerts switched off', async () => {
    const tables = wire({ tenants: table({ ...FLAGS_ALL_OFF }) })

    const result = await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 25, reorder_level: 20 })],
      new Map([['flour', -10]]),
    )

    expect(result.alertsRaised).toBe(0)
    expect(tables.stock_alerts.calls.insert).toBeUndefined()
  })

  it('does not raise a second alert while one is still open for that ingredient', async () => {
    // Otherwise a receive-then-sell cycle re-alerts for an ingredient the
    // merchant already knows about and has not yet dealt with.
    const tables = wire({
      tenants: table(FLAGS_ALL_ON),
      stock_alerts: table([{ id: 'open-1', inventory_item_id: 'flour' }]),
    })

    const result = await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 25, reorder_level: 20 })],
      new Map([['flour', -10]]),
    )

    expect(result.alertsRaised).toBe(0)
    expect(tables.stock_alerts.calls.insert).toBeUndefined()
  })

  it('closes an open alert when a delivery brings the ingredient back to ok', async () => {
    // Recovery raises no alert, but it must clear the old one — otherwise the
    // dedup guard suppresses the next genuine crossing forever.
    const tables = wire({
      tenants: table(FLAGS_ALL_ON),
      stock_alerts: table([{ id: 'open-1', inventory_item_id: 'flour' }]),
    })

    const result = await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 5, reorder_level: 20 })],
      new Map([['flour', 100]]),
    )

    expect(result.alertsResolved).toBe(1)
    expect(tables.stock_alerts.calls.update?.[0][0]).toMatchObject({
      resolved_at: expect.any(String),
    })
  })

  it('leaves an open alert alone while the ingredient is still low', async () => {
    const tables = wire({
      tenants: table(FLAGS_ALL_ON),
      stock_alerts: table([{ id: 'open-1', inventory_item_id: 'flour' }]),
    })

    const result = await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 15, reorder_level: 20 })],
      new Map([['flour', -1]]),
    )

    expect(result.alertsResolved).toBe(0)
    expect(tables.stock_alerts.calls.update).toBeUndefined()
  })

  it('records the out level when an ingredient is exhausted outright', async () => {
    const tables = wire({ tenants: table(FLAGS_ALL_ON) })

    await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 100, reorder_level: 20 })],
      new Map([['flour', -100]]),
    )

    expect(tables.stock_alerts.calls.insert?.[0][0]).toEqual([
      expect.objectContaining({ level: 'out', quantity: 0 }),
    ])
  })
})

describe('processStockLevelChanges — auto-86', () => {
  const OUT_OF_FLOUR = new Map([['flour', -100]])
  const FLOUR_ITEM = [ingredient({ current_qty: 100, reorder_level: 20 })]

  function wireRecipes(flags: Record<string, boolean>) {
    return wire({
      tenants: table(flags),
      recipe_components: table([
        { id: 'c1', recipe_id: 'r-base', inventory_item_id: 'flour', tenant_id: 't1' },
      ]),
      recipes: table([
        { id: 'r-base', target_type: 'menu_item', menu_item_id: 'menu-1', tenant_id: 't1' },
      ]),
    })
  }

  it('takes a menu item off the menu when its base ingredient runs out', async () => {
    const tables = wireRecipes(FLAGS_ALL_ON)

    const result = await processStockLevelChanges('t1', FLOUR_ITEM, OUT_OF_FLOUR)

    expect(result.menuItemsDisabled).toEqual(['menu-1'])
    expect(tables.menu_items.calls.update?.[0][0]).toMatchObject({ is_available: false })
    expect(tables.menu_items.calls.in?.[0]).toEqual(['id', ['menu-1']])
  })

  it('leaves the menu alone when the tenant has auto-86 switched off', async () => {
    // Default-off is the point: an unasked-for auto-86 hides a bestseller.
    const tables = wireRecipes({ low_stock_alerts_enabled: true, auto_86_enabled: false })

    const result = await processStockLevelChanges('t1', FLOUR_ITEM, OUT_OF_FLOUR)

    expect(result.menuItemsDisabled).toEqual([])
    expect(tables.menu_items.calls.update).toBeUndefined()
  })

  it('leaves the menu alone when an ingredient is merely low, not out', async () => {
    const tables = wireRecipes(FLAGS_ALL_ON)

    const result = await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 25, reorder_level: 20 })],
      new Map([['flour', -10]]),
    )

    expect(result.menuItemsDisabled).toEqual([])
    expect(tables.menu_items.calls.update).toBeUndefined()
  })

  it('stamps the item as auto-disabled so it can be told apart later', async () => {
    // Without the stamp there is no way to distinguish an item this system hid
    // from one the merchant deliberately turned off, and recovery would undo
    // the merchant's decision.
    const tables = wireRecipes(FLAGS_ALL_ON)

    await processStockLevelChanges('t1', FLOUR_ITEM, OUT_OF_FLOUR)

    expect(tables.menu_items.calls.update?.[0][0]).toMatchObject({
      is_available: false,
      auto_disabled_at: expect.any(String),
    })
  })

  it('does not claim an item the merchant had already turned off', async () => {
    // Stamping an already-hidden item would make the next delivery put it back
    // on the menu against the merchant's wishes.
    const tables = wireRecipes(FLAGS_ALL_ON)

    await processStockLevelChanges('t1', FLOUR_ITEM, OUT_OF_FLOUR)

    expect(tables.menu_items.calls.eq).toContainEqual(['is_available', true])
  })
})

/**
 * Phase 5C — the way back onto the menu.
 *
 * The gap this closes: a merchant who restocked found the dish still hidden,
 * with the alert already auto-resolved, so nothing on any screen explained why.
 */
describe('processStockLevelChanges — auto-86 recovery', () => {
  const FLOUR_RESTOCKED = new Map([['flour', 500]])
  const EMPTY_FLOUR = [ingredient({ current_qty: 0, reorder_level: 20 })]

  function wireRecovery(flags: Record<string, boolean>, changed: unknown[] = [{ id: 'menu-1' }]) {
    return wire({
      tenants: table(flags),
      recipe_components: table([
        { id: 'c1', recipe_id: 'r-base', inventory_item_id: 'flour', tenant_id: 't1' },
      ]),
      recipes: table([
        { id: 'r-base', target_type: 'menu_item', menu_item_id: 'menu-1', tenant_id: 't1' },
      ]),
      inventory_items: table([{ id: 'flour', current_qty: 0, reorder_level: 20 }]),
      menu_items: table(changed),
    })
  }

  it('brings a menu item back when its ingredient is restocked', async () => {
    const tables = wireRecovery(FLAGS_ALL_ON)

    const result = await processStockLevelChanges('t1', EMPTY_FLOUR, FLOUR_RESTOCKED)

    expect(result.menuItemsReEnabled).toEqual(['menu-1'])
    expect(tables.menu_items.calls.update?.[0][0]).toMatchObject({
      is_available: true,
      auto_disabled_at: null,
    })
  })

  it('only brings back items this system disabled itself', async () => {
    // Filtered in the UPDATE rather than read-then-write, so a merchant
    // toggling availability at the same moment cannot slip between the two.
    const tables = wireRecovery(FLAGS_ALL_ON)

    await processStockLevelChanges('t1', EMPTY_FLOUR, FLOUR_RESTOCKED)

    expect(tables.menu_items.calls.not).toContainEqual(['auto_disabled_at', 'is', null])
  })

  it('leaves the menu alone on recovery when auto-86 is switched off', async () => {
    const tables = wireRecovery({ low_stock_alerts_enabled: true, auto_86_enabled: false })

    const result = await processStockLevelChanges('t1', EMPTY_FLOUR, FLOUR_RESTOCKED)

    expect(result.menuItemsReEnabled).toEqual([])
    expect(tables.menu_items.calls.update).toBeUndefined()
  })

  it('reports nothing when the update matched no auto-disabled row', async () => {
    const tables = wireRecovery(FLAGS_ALL_ON, [])

    const result = await processStockLevelChanges('t1', EMPTY_FLOUR, FLOUR_RESTOCKED)

    expect(result.menuItemsReEnabled).toEqual([])
    expect(tables.menu_items.calls.update).toBeDefined()
  })

  it('keeps a dish off the menu while a second base ingredient is still out', async () => {
    // Reads the untouched ingredient from the database, but trusts the applied
    // delta for the one that just moved — re-reading that row would race the
    // running-total trigger.
    const tables = wire({
      tenants: table(FLAGS_ALL_ON),
      recipe_components: table([
        { id: 'c1', recipe_id: 'r-base', inventory_item_id: 'flour', tenant_id: 't1' },
        { id: 'c2', recipe_id: 'r-base', inventory_item_id: 'sugar', tenant_id: 't1' },
      ]),
      recipes: table([
        { id: 'r-base', target_type: 'menu_item', menu_item_id: 'menu-1', tenant_id: 't1' },
      ]),
      inventory_items: table([
        { id: 'flour', current_qty: 0, reorder_level: 20 },
        { id: 'sugar', current_qty: 0, reorder_level: 5 },
      ]),
    })

    const result = await processStockLevelChanges('t1', EMPTY_FLOUR, FLOUR_RESTOCKED)

    expect(result.menuItemsReEnabled).toEqual([])
    expect(tables.menu_items.calls.update).toBeUndefined()
  })
})

describe('processStockLevelChanges — resilience', () => {
  it('does not touch the database when no movement crossed a line', async () => {
    const tables = wire({ tenants: table(FLAGS_ALL_ON) })

    const result = await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 100, reorder_level: 20 })],
      new Map([['flour', -10]]),
    )

    expect(result).toEqual({
      alertsRaised: 0,
      alertsResolved: 0,
      menuItemsDisabled: [],
      menuItemsReEnabled: [],
    })
    expect(tables.stock_alerts.calls.insert).toBeUndefined()
    expect(from).not.toHaveBeenCalledWith('tenants')
  })

  it('never throws when the alert write fails', async () => {
    // This runs behind an order that is already paid for. A failed alert must
    // not surface as a failed sale.
    from.mockImplementation((name: string) => {
      if (name === 'tenants') return table(FLAGS_ALL_ON)
      throw new Error('stock_alerts is on fire')
    })

    await expect(
      processStockLevelChanges(
        't1',
        [ingredient({ current_qty: 25, reorder_level: 20 })],
        new Map([['flour', -10]]),
      ),
    ).resolves.toEqual({
      alertsRaised: 0,
      alertsResolved: 0,
      menuItemsDisabled: [],
      menuItemsReEnabled: [],
    })
  })

  it('treats a tenant row it cannot read as having both features off', async () => {
    from.mockImplementation((name: string) => {
      if (name === 'tenants') return table({})
      return table([])
    })

    const result = await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 25, reorder_level: 20 })],
      new Map([['flour', -10]]),
    )

    expect(result.alertsRaised).toBe(0)
  })
})

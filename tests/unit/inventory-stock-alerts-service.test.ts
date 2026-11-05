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

const mockReconcileAuto86 = jest.fn()
jest.mock('@/lib/inventory/auto-86-service', () => ({
  reconcileAuto86: (...args: unknown[]) => mockReconcileAuto86(...args),
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
  return { ...chain, calls }
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
  inventory_stock?: ReturnType<typeof table>
}

function wire(tables: Tables): Required<Tables> {
  const resolved = {
    tenants: tables.tenants ?? table({}),
    stock_alerts: tables.stock_alerts ?? table([]),
    recipe_components: tables.recipe_components ?? table([]),
    recipes: tables.recipes ?? table([]),
    menu_items: tables.menu_items ?? table([]),
    inventory_items: tables.inventory_items ?? table([]),
    inventory_stock: tables.inventory_stock ?? table([]),
  }
  from.mockImplementation((name: keyof Tables) => resolved[name])
  return resolved
}

const FLAGS_ALL_ON = { low_stock_alerts_enabled: true, auto_86_enabled: true }
const FLAGS_ALL_OFF = { low_stock_alerts_enabled: false, auto_86_enabled: false }

beforeEach(() => {
  from.mockReset()
  mockReconcileAuto86.mockReset()
  mockReconcileAuto86.mockResolvedValue({ disabled: [], reEnabled: [] })
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

  it("escalates an open 'low' alert to 'out' when the ingredient runs out", async () => {
    // The dedup guard used to swallow this crossing: the row kept saying "low"
    // over an empty shelf, and the merchant was never told it ran out. The
    // UPDATE is what the bell's trigger turns into an "out of stock" notice.
    const tables = wire({
      tenants: table(FLAGS_ALL_ON),
      stock_alerts: table([
        { id: 'open-1', inventory_item_id: 'flour', level: 'low', outlet_id: null },
      ]),
    })

    const result = await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 10, reorder_level: 20 })],
      new Map([['flour', -10]]),
    )

    expect(result.alertsRaised).toBe(1)
    expect(tables.stock_alerts.calls.insert).toBeUndefined()
    expect(tables.stock_alerts.calls.update?.[0][0]).toEqual({ level: 'out', quantity: 0 })
    expect(tables.stock_alerts.calls.in).toEqual(expect.arrayContaining([['id', ['open-1']]]))
  })

  it("does not let a store-wide crossing escalate a branch's low alert", async () => {
    // The roll-up ran out, but North's row is about North's shelf, which this
    // caller never looked at.
    const tables = wire({
      tenants: table(FLAGS_ALL_ON),
      stock_alerts: table([
        { id: 'north-1', inventory_item_id: 'flour', level: 'low', outlet_id: 'north' },
      ]),
    })

    await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 10, reorder_level: 20 })],
      new Map([['flour', -10]]),
    )

    expect(tables.stock_alerts.calls.update).toBeUndefined()
  })

  it("leaves an open 'out' alert alone when stock dips further", async () => {
    const tables = wire({
      tenants: table(FLAGS_ALL_ON),
      stock_alerts: table([
        { id: 'open-1', inventory_item_id: 'flour', level: 'out', outlet_id: null },
      ]),
    })

    const result = await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 10, reorder_level: 20 })],
      new Map([['flour', -10]]),
    )

    expect(result.alertsRaised).toBe(0)
    expect(tables.stock_alerts.calls.update).toBeUndefined()
  })
})

describe('processStockLevelChanges — auto-86 decides on the level', () => {
  /**
   * Auto-86 moved to `auto-86-service.ts` (level-based; tested there against
   * the PostgREST-faithful fake). This entry point only has to hand it the
   * ingredients that moved, on every batch, for a store that has it on.
   */
  it('hands auto-86 the moved ingredients even when nothing crossed a line', async () => {
    // Egg already at -1, sold again: out -> out is no crossing, but the dish
    // a person turned back on must still come off.
    wire({ tenants: table(FLAGS_ALL_ON) })
    mockReconcileAuto86.mockResolvedValue({ disabled: ['chicken'], reEnabled: [] })

    const result = await processStockLevelChanges('t1', [ingredient({ id: 'egg', current_qty: -1, reorder_level: 0 })], new Map([['egg', -1]]))

    expect(mockReconcileAuto86).toHaveBeenCalledWith(expect.anything(), 't1', ['egg'])
    expect(result.menuItemsDisabled).toEqual(['chicken'])
  })

  it('reports what auto-86 put back', async () => {
    wire({ tenants: table(FLAGS_ALL_ON) })
    mockReconcileAuto86.mockResolvedValue({ disabled: [], reEnabled: ['menu-1'] })

    const result = await processStockLevelChanges('t1', [ingredient({ current_qty: 0 })], new Map([['flour', 500]]))

    expect(result.menuItemsReEnabled).toEqual(['menu-1'])
  })

  it('leaves the menu alone when the tenant has auto-86 switched off', async () => {
    wire({ tenants: table({ low_stock_alerts_enabled: true, auto_86_enabled: false }) })

    const result = await processStockLevelChanges('t1', [ingredient({ current_qty: 100 })], new Map([['flour', -100]]))

    expect(mockReconcileAuto86).not.toHaveBeenCalled()
    expect(result.menuItemsDisabled).toEqual([])
  })

  it('judges auto-86 on the store roll-up even when a branch is named (ingredient ids only)', async () => {
    // menu_items.is_available is store-wide: one branch at zero must not hide
    // the dish chain-wide. reconcileAuto86 reads inventory_items (the roll-up).
    wire({ tenants: table(FLAGS_ALL_ON) })

    await processStockLevelChanges('t1', [ingredient({ current_qty: 700 })], new Map([['flour', -10]]), 'south')

    expect(mockReconcileAuto86).toHaveBeenCalledWith(expect.anything(), 't1', ['flour'])
  })

  it('keeps the alerts when auto-86 fails', async () => {
    const tables = wire({ tenants: table(FLAGS_ALL_ON) })
    mockReconcileAuto86.mockRejectedValue(new Error('recipes unreadable'))

    const result = await processStockLevelChanges('t1', [ingredient({ current_qty: 25, reorder_level: 20 })], new Map([['flour', -10]]))

    expect(result.alertsRaised).toBe(1)
    expect(tables.stock_alerts.calls.insert).toBeDefined()
    expect(result.menuItemsDisabled).toEqual([])
  })
})

describe('processStockLevelChanges — a partial restock, below the reorder level', () => {
  const EMPTY_FLOUR = [ingredient({ current_qty: 0, reorder_level: 20 })]
  const FLOUR_RESTOCKED = new Map([['flour', 500]])
  const PARTIAL_RESTOCK = new Map([['flour', 10]])

  it('leaves the low-stock alert open, because the merchant still needs to reorder', async () => {
    // The mirror of the bug: fixing recovery must not start closing alerts
    // early. Availability asks "can this be made?"; the alert asks "should
    // more be ordered?" — a partial delivery answers only the first.
    const tables = wire({
      tenants: table(FLAGS_ALL_ON),
      stock_alerts: table([{ id: 'a1', inventory_item_id: 'flour' }]),
      recipe_components: table([
        { id: 'c1', recipe_id: 'r-base', inventory_item_id: 'flour', tenant_id: 't1' },
      ]),
      recipes: table([
        { id: 'r-base', target_type: 'menu_item', menu_item_id: 'menu-1', tenant_id: 't1' },
      ]),
      inventory_items: table([{ id: 'flour', current_qty: 0, reorder_level: 20 }]),
      menu_items: table([{ id: 'menu-1' }]),
    })

    const result = await processStockLevelChanges('t1', EMPTY_FLOUR, PARTIAL_RESTOCK)

    expect(result.alertsResolved).toBe(0)
    // The row is rewritten to say 'low' rather than closed — corrected, not
    // resolved. Nothing sets `resolved_at`.
    for (const [payload] of tables.stock_alerts.calls.update ?? []) {
      expect(payload).not.toHaveProperty('resolved_at')
    }
  })

  it("corrects the open alert from 'out' to 'low' instead of leaving it stale", async () => {
    // The alert row is a snapshot of the moment it was raised, and nothing
    // ever revised it. So the banner went on saying "Flour is out of stock"
    // over a shelf with 10 g on it — the merchant is told to drop everything
    // for a delivery that already arrived.
    const tables = wire({
      tenants: table(FLAGS_ALL_ON),
      stock_alerts: table([{ id: 'a1', inventory_item_id: 'flour' }]),
      inventory_items: table([{ id: 'flour', current_qty: 0, reorder_level: 20 }]),
    })

    await processStockLevelChanges('t1', EMPTY_FLOUR, PARTIAL_RESTOCK)

    expect(tables.stock_alerts.calls.update?.[0][0]).toMatchObject({
      level: 'low',
      quantity: 10,
    })
  })

  it('still resolves the alert once the delivery clears the reorder level', async () => {
    const tables = wire({
      tenants: table(FLAGS_ALL_ON),
      stock_alerts: table([{ id: 'a1', inventory_item_id: 'flour' }]),
      inventory_items: table([{ id: 'flour', current_qty: 0, reorder_level: 20 }]),
    })

    const result = await processStockLevelChanges('t1', EMPTY_FLOUR, FLOUR_RESTOCKED)

    expect(result.alertsResolved).toBe(1)
    expect(tables.stock_alerts.calls.update).toBeDefined()
  })
})

describe('processStockLevelChanges — resilience', () => {
  it('still raises the other alerts when a concurrent order raised one of them first (23505)', async () => {
    // One open alert per ingredient per branch is a unique index, and a batch
    // insert is all or nothing: a duplicate must not swallow the rest.
    const inserts: unknown[][] = []
    const alerts = {
      ...table([]),
      insert: (rows: unknown[]) => {
        inserts.push(rows)
        const isBatch = rows.length > 1
        const isDuplicate = !isBatch && (rows[0] as { inventory_item_id: string }).inventory_item_id === 'flour'
        return Promise.resolve({ data: null, error: isBatch || isDuplicate ? { code: '23505', message: 'duplicate' } : null })
      },
    }
    wire({ tenants: table({ low_stock_alerts_enabled: true, auto_86_enabled: false }), stock_alerts: alerts as never })

    const result = await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 25, reorder_level: 20 }), ingredient({ id: 'sugar', name: 'Sugar', current_qty: 25, reorder_level: 20 })],
      new Map([['flour', -10], ['sugar', -10]]),
    )

    expect(inserts).toHaveLength(3)
    expect(result.alertsRaised).toBe(1)
  })

  it('raises no branch alert when the branch shelf cannot be read (never reads it as zero)', async () => {
    const branchStock: Record<string, unknown> = {
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'timeout' } }),
    }
    for (const method of ['select', 'eq', 'in']) branchStock[method] = () => branchStock
    const tables = wire({ tenants: table(FLAGS_ALL_ON), inventory_stock: branchStock as never })

    const result = await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 100, reorder_level: 20 })],
      new Map([['flour', -10]]),
      'south',
    )

    expect(result.alertsRaised).toBe(0)
    expect(tables.stock_alerts.calls.insert).toBeUndefined()
  })

  it('reads only the flags when nothing crossed a line and auto-86 is off', async () => {
    const tables = wire({ tenants: table({ low_stock_alerts_enabled: true, auto_86_enabled: false }) })

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
    expect(mockReconcileAuto86).not.toHaveBeenCalled()
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

describe('processStockLevelChanges — one branch, not the whole chain', () => {
  /**
   * The alert path evaluated `inventory_items.current_qty`, the roll-up. North
   * holding 700g of flour and South holding none reads as 700g, clears every
   * threshold, and nobody tells South they cannot cook. The panel that makes
   * that visible has existed since Phase 2; the path that actually interrupts
   * a merchant was still blind to it.
   */
  const NORTH = 'o-north'
  const SOUTH = 'o-south'

  const branchRows = (rows: Array<Record<string, unknown>>) => table(rows)

  it('alerts on a branch that has run out while the chain looks healthy', async () => {
    const tables = wire({
      tenants: table(FLAGS_ALL_ON),
      // 700 across the chain. South held 10 and has just sold all of it, so
      // the shelf now reads 0 -- these rows are what the DB returns AFTER the
      // movement, which is when the alert path can read them.
      inventory_stock: branchRows([
        { inventory_item_id: 'flour', outlet_id: SOUTH, current_qty: 0, reorder_level: 0 },
        { inventory_item_id: 'flour', outlet_id: NORTH, current_qty: 690, reorder_level: 0 },
      ]),
    })

    const result = await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 700, reorder_level: 20 })],
      new Map([['flour', -10]]),
      SOUTH,
    )

    expect(result.alertsRaised).toBe(1)
  })

  it('stamps the alert with the branch it is about', async () => {
    // Without this the merchant is told "Flour is out" and not which shop's.
    const tables = wire({
      tenants: table(FLAGS_ALL_ON),
      inventory_stock: branchRows([
        { inventory_item_id: 'flour', outlet_id: SOUTH, current_qty: 0, reorder_level: 0 },
      ]),
    })

    await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 700, reorder_level: 20 })],
      new Map([['flour', -10]]),
      SOUTH,
    )

    expect(tables.stock_alerts.calls.insert?.[0][0]).toEqual([
      expect.objectContaining({ inventory_item_id: 'flour', outlet_id: SOUTH }),
    ])
  })

  it('does not let one branch open alert silence another branch', async () => {
    // The dedup guard keyed on the ingredient alone would turn into exactly
    // the blindness this change removes: North's open alert would suppress
    // South's.
    const tables = wire({
      tenants: table(FLAGS_ALL_ON),
      // The service must ask only about THIS branch, so the open-alert lookup
      // returns nothing for South even though North has one.
      stock_alerts: table([]),
      inventory_stock: branchRows([
        { inventory_item_id: 'flour', outlet_id: SOUTH, current_qty: 0, reorder_level: 0 },
      ]),
    })

    await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 700, reorder_level: 20 })],
      new Map([['flour', -10]]),
      SOUTH,
    )

    // The dedup read is filtered by branch, not just by ingredient.
    const eqArgs = (tables.stock_alerts.calls.eq ?? []).map(([column]) => column)
    expect(eqArgs).toContain('outlet_id')
  })

  it('leaves store-wide behaviour exactly as it was when no branch is given', async () => {
    // Regression lock: a single-shop tenant, or any caller that has no branch
    // to name, must behave byte-for-byte as before and never read the branch
    // table at all.
    const tables = wire({ tenants: table(FLAGS_ALL_ON) })

    const result = await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 25, reorder_level: 20 })],
      new Map([['flour', -10]]),
    )

    expect(result.alertsRaised).toBe(1)
    expect(tables.stock_alerts.calls.insert?.[0][0]).toEqual([
      expect.objectContaining({ inventory_item_id: 'flour', quantity: 15 }),
    ])
    expect(tables.inventory_stock.calls.select).toBeUndefined()
  })
})

describe('processStockLevelChanges — the branch figure is read after the write', () => {
  /**
   * The alert path deliberately takes PRE-movement rows plus the deltas just
   * applied, because re-reading would race the running-total trigger. The
   * branch read has no such luxury: `inventory_stock` is only consulted after
   * the movement is on the ledger, so it comes back already reduced. Applying
   * the delta to it a second time would invent a crossing that never happened.
   */
  const SOUTH = 'o-south'

  it('does not double-count the delta against the branch shelf', async () => {
    // South held 15 and sold 10, so the shelf now reads 5. It was below the
    // par level of 20 before the sale and is below it after: low to low, no
    // crossing, nothing to interrupt anyone about.
    //
    // Counting the delta twice reads it as 5 going to -5 -- an out crossing --
    // and raises an alert for stock that did not run out.
    const tables = wire({
      tenants: table(FLAGS_ALL_ON),
      inventory_stock: table([
        { inventory_item_id: 'flour', outlet_id: SOUTH, current_qty: 5, reorder_level: 20 },
      ]),
    })

    const result = await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 700, reorder_level: 20 })],
      new Map([['flour', -10]]),
      SOUTH,
    )

    expect(result.alertsRaised).toBe(0)
    expect(tables.stock_alerts.calls.insert).toBeUndefined()
  })

  it('still alerts on the crossing the branch actually made', async () => {
    // South held 25 and sold 10: the shelf now reads 15, and 25 -> 15 crosses
    // a par level of 20. The same read, one real crossing.
    const tables = wire({
      tenants: table(FLAGS_ALL_ON),
      inventory_stock: table([
        { inventory_item_id: 'flour', outlet_id: SOUTH, current_qty: 15, reorder_level: 20 },
      ]),
    })

    const result = await processStockLevelChanges(
      't1',
      [ingredient({ current_qty: 700, reorder_level: 20 })],
      new Map([['flour', -10]]),
      SOUTH,
    )

    expect(result.alertsRaised).toBe(1)
    expect(tables.stock_alerts.calls.insert?.[0][0]).toEqual([
      expect.objectContaining({ level: 'low', quantity: 15, outlet_id: SOUTH }),
    ])
  })
})

/**
 * DEFECT B — a cancellation racing the fire-and-forget depletion.
 *
 * Depletion runs after the order is saved, detached from the request. A fast
 * cancel could reach `reverseOrderStockMovements` before the sale rows landed:
 * the reverse read the (still-empty) movements and returned EMPTY_RESULT
 * before ever taking its void claim, so when the sale landed a moment later it
 * was never reversed — stock spent forever for a cancelled order.
 *
 * Two changes close this deterministically, in each other's favour:
 *
 * 1. The reverse claims its void BEFORE reading movements. A sale that landed
 *    in the window is seen by the (later) read and reversed.
 * 2. The sale path refuses to write when a void claim already exists at or
 *    above its revision — cancel wins, the sale claim is handed back, and the
 *    order ends with no stock moved in either direction.
 *
 * A zero-movement reverse deliberately KEEPS its void claim: that claim is now
 * the guard the sale path checks.
 */

import {
  applyOrderStockMovements,
  reverseOrderStockMovements,
} from '@/lib/inventory/order-stock-service'
import type { OrderStockClaimRow } from '@/lib/inventory/order-stock-claim'

const TENANT = '44444444-4444-4444-8444-444444444444'
const ORDER = 'ord-race-1'
const FLOUR = 'item-flour'
const GRAM = 'unit-gram'

const from = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (...a: unknown[]) => from(...a) }),
}))

jest.mock('@/lib/inventory/stock-alerts-service', () => ({
  processStockLevelChanges: jest.fn(() =>
    Promise.resolve({
      alertsRaised: 0,
      alertsResolved: 0,
      menuItemsDisabled: [],
      menuItemsReEnabled: [],
    }),
  ),
}))

const RECIPES = [
  { id: 'rec-1', tenant_id: TENANT, menu_item_id: 'menu-1', target_type: 'menu_item', target_id: null },
]
const COMPONENTS = [
  { id: 'cmp-1', tenant_id: TENANT, recipe_id: 'rec-1', inventory_item_id: FLOUR, unit_id: GRAM, quantity: 100 },
]
const INGREDIENTS = [
  { id: FLOUR, tenant_id: TENANT, name: 'Flour', stock_unit_id: GRAM, current_qty: 1000, reorder_level: 0, is_active: true },
]
const UNITS = [
  { id: GRAM, tenant_id: TENANT, name: 'Gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 },
]

const ORDER_ITEMS = [{ menuItemId: 'menu-1', quantity: 1 }]

const SALE_MOVEMENT = {
  inventory_item_id: FLOUR,
  outlet_id: null,
  quantity_delta: -100,
  entered_quantity: 100,
  entered_unit_id: GRAM,
}

/**
 * A stateful world: claims accumulate as they are inserted, the void release
 * is tracked, and the movements read can be made time-dependent.
 */
function buildWorld(options: {
  claims?: OrderStockClaimRow[]
  /** Called at read time; lets a test land the sale between claim and read. */
  movementsNow?: () => unknown[]
}) {
  const claims: OrderStockClaimRow[] = [...(options.claims ?? [])]
  const claimInserts: Record<string, unknown>[] = []
  const claimReleases: Record<string, unknown>[] = []
  const ledgerInserts: Record<string, unknown>[] = []

  const dataFor = (table: string): unknown[] => {
    if (table === 'recipes') return RECIPES
    if (table === 'recipe_components') return COMPONENTS
    if (table === 'inventory_items') return INGREDIENTS
    if (table === 'inventory_units') return UNITS
    if (table === 'stock_movements') return options.movementsNow?.() ?? []
    return []
  }

  const impl = (table: string) => {
    if (table === 'order_stock_applications') {
      const chain = {
        eq: () => chain,
        then: (resolve: (r: unknown) => unknown) =>
          resolve({ data: [...claims], error: null }),
      }
      return {
        select: () => chain,
        insert: (row: { reason: 'sale' | 'void'; revision: number }) => {
          const duplicate = claims.some(
            (c) => c.reason === row.reason && c.revision === row.revision,
          )
          if (!duplicate) {
            claims.push({ reason: row.reason, revision: row.revision })
            claimInserts.push(row as unknown as Record<string, unknown>)
          }
          return Promise.resolve({
            data: null,
            error: duplicate ? { code: '23505', message: 'duplicate key' } : null,
          })
        },
        delete: () => {
          const filters: Record<string, unknown> = {}
          const del = {
            eq: (column: string, value: unknown) => {
              filters[column] = value
              return del
            },
            then: (resolve: (r: unknown) => unknown) => {
              claimReleases.push({ ...filters })
              const index = claims.findIndex(
                (c) => c.reason === filters.reason && c.revision === filters.revision,
              )
              if (index >= 0) claims.splice(index, 1)
              return resolve({ error: null })
            },
          }
          return del
        },
      }
    }

    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      limit: () => Promise.resolve({ data: dataFor(table), error: null }),
      then: (resolve: (r: unknown) => unknown) =>
        resolve({ data: dataFor(table), error: null }),
      insert: (rows: unknown[]) => {
        ledgerInserts.push(...(rows as Record<string, unknown>[]))
        return Promise.resolve({ data: null, error: null })
      },
    }
    return chain
  }

  return { impl, claims, claimInserts, claimReleases, ledgerInserts }
}

beforeEach(() => {
  from.mockReset()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('reverse claims the void before reading movements', () => {
  it('reverses a sale that lands between the claim and the read', async () => {
    // Arrange — the sale claim exists but its ledger rows only become visible
    // AFTER the reverse has taken its void claim (the exact race window).
    const world = buildWorld({
      claims: [{ reason: 'sale', revision: 0 }],
      movementsNow: () =>
        world.claims.some((c) => c.reason === 'void') ? [SALE_MOVEMENT] : [],
    })
    from.mockImplementation(world.impl)

    // Act
    const result = await reverseOrderStockMovements(TENANT, ORDER)

    // Assert — claim-first ordering means the read sees the landed sale.
    expect(result.movementCount).toBe(1)
    expect(world.ledgerInserts).toContainEqual(
      expect.objectContaining({ inventory_item_id: FLOUR, reason: 'void', quantity_delta: 100 }),
    )
  })

  it('keeps its void claim when there is nothing to reverse yet', async () => {
    // The kept claim IS the guard the sale path checks.
    const world = buildWorld({ claims: [] })
    from.mockImplementation(world.impl)

    const result = await reverseOrderStockMovements(TENANT, ORDER)

    expect(result.movementCount).toBe(0)
    expect(world.claims).toContainEqual({ reason: 'void', revision: 0 })
    expect(world.claimReleases).toEqual([])
  })
})

describe('the sale path defers to an existing void claim (cancel wins)', () => {
  it('refuses to deplete when the order\'s void is already claimed at the same revision', async () => {
    const world = buildWorld({ claims: [{ reason: 'void', revision: 0 }] })
    from.mockImplementation(world.impl)

    const result = await applyOrderStockMovements(TENANT, ORDER, ORDER_ITEMS, 'sale', 0)

    expect(result.movementCount).toBe(0)
    expect(world.ledgerInserts).toEqual([])
    // The sale claim was handed back, so the aborted attempt leaves no trace.
    expect(world.claims).toEqual([{ reason: 'void', revision: 0 }])
  })

  it('a void claimed at a later revision still outranks the sale', async () => {
    const world = buildWorld({ claims: [{ reason: 'void', revision: 2 }] })
    from.mockImplementation(world.impl)

    const result = await applyOrderStockMovements(TENANT, ORDER, ORDER_ITEMS, 'sale', 0)

    expect(result.movementCount).toBe(0)
    expect(world.ledgerInserts).toEqual([])
  })

  it('an edit\'s void direction is never blocked by its own guard', async () => {
    // The guard is for sales only: an edit returning ingredients writes a
    // 'void' movement and must not be refused because a void claim exists.
    const world = buildWorld({ claims: [{ reason: 'void', revision: 0 }] })
    from.mockImplementation(world.impl)

    const result = await applyOrderStockMovements(TENANT, ORDER, ORDER_ITEMS, 'void', 1)

    expect(result.movementCount).toBe(1)
    expect(world.ledgerInserts).toContainEqual(
      expect.objectContaining({ inventory_item_id: FLOUR, reason: 'void', quantity_delta: 100 }),
    )
  })

  it('an order cancelled before it ever depleted ends with no stock moved at all', async () => {
    // Arrange — the full race, both halves in cancel-first order.
    const world = buildWorld({ claims: [], movementsNow: () => [] })
    from.mockImplementation(world.impl)

    // Act — the cancel arrives first (nothing to reverse), then the detached
    // depletion fires.
    const reversed = await reverseOrderStockMovements(TENANT, ORDER)
    const depleted = await applyOrderStockMovements(TENANT, ORDER, ORDER_ITEMS, 'sale', 0)

    // Assert — neither direction ever touched the ledger.
    expect(reversed.movementCount).toBe(0)
    expect(depleted.movementCount).toBe(0)
    expect(world.ledgerInserts).toEqual([])

    // And a later depletion retry stays a no-op.
    const retried = await applyOrderStockMovements(TENANT, ORDER, ORDER_ITEMS, 'sale', 0)
    expect(retried.movementCount).toBe(0)
    expect(world.ledgerInserts).toEqual([])
  })
})

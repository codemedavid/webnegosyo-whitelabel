/**
 * DEFECT A — un-cancelling an order loses its deduction forever.
 *
 * The admin status select is free: cancelled → confirmed is one click. The
 * cancel restored the stock (a `void` claim + reversal rows), but nothing
 * re-deducted on the way back — and both the ('sale', 0) and ('void', 0)
 * claims were burned, so no future path could ever move stock for the order
 * again. The sale was permanently lost from the ledger.
 *
 * The fix reuses the revision machinery order editing built: an un-cancel
 * re-depletes at a FRESH revision (one above every claim the order holds), and
 * a second cancellation claims its void at a matching fresh revision, so the
 * pair can ping-pong indefinitely without ever colliding on the unique index.
 */

import { redepleteOrderStockBestEffort, reverseOrderStockMovements } from '@/lib/inventory/order-stock-service'
import {
  resolveRedepletionRevision,
  resolveVoidClaimRevision,
  hasBlockingVoidClaim,
  type OrderStockClaimRow,
} from '@/lib/inventory/order-stock-claim'

const TENANT = '44444444-4444-4444-8444-444444444444'
const ORDER = 'ord-uncancel-1'
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

interface StubOptions {
  /** Claims already sitting in order_stock_applications. */
  claims?: OrderStockClaimRow[]
  /** The order's recorded ledger rows, served to a reversal. */
  movements?: unknown[]
  /** The order's saved lines, served to the re-depletion read. */
  orderItems?: unknown[]
  /** Force the orders read to fail. */
  orderReadError?: { message: string }
}

/** Full-pipeline stub in the style of inventory-order-stock-branch. */
function stubPipeline(
  claimInserts: Record<string, unknown>[],
  ledgerInserts: Record<string, unknown>[],
  options: StubOptions = {},
) {
  const dataFor = (table: string): unknown[] => {
    if (table === 'recipes') return RECIPES
    if (table === 'recipe_components') return COMPONENTS
    if (table === 'inventory_items') return INGREDIENTS
    if (table === 'inventory_units') return UNITS
    if (table === 'stock_movements') return options.movements ?? []
    if (table === 'order_items') return options.orderItems ?? [{ menu_item_id: 'menu-1', quantity: 2 }]
    return []
  }

  return (table: string) => {
    if (table === 'orders') {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve(
            options.orderReadError
              ? { data: null, error: options.orderReadError }
              : { data: { id: ORDER, outlet_id: null }, error: null },
          ),
      }
      return chain
    }

    if (table === 'order_stock_applications') {
      const chain = {
        eq: () => chain,
        then: (resolve: (r: unknown) => unknown) =>
          resolve({ data: options.claims ?? [], error: null }),
      }
      return {
        select: () => chain,
        insert: (row: Record<string, unknown>) => {
          claimInserts.push(row)
          return Promise.resolve({ data: null, error: null })
        },
        delete: () => ({
          eq: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }) }),
        }),
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
}

beforeEach(() => {
  from.mockReset()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('redepleteOrderStockBestEffort (un-cancel)', () => {
  it('claims the sale one revision above every claim the order holds', async () => {
    // Arrange — the order was sold (sale@0) and cancelled (void@0). Both
    // revision-0 claims are burned; the re-depletion must mint a new one.
    const claimInserts: Record<string, unknown>[] = []
    const ledgerInserts: Record<string, unknown>[] = []
    from.mockImplementation(
      stubPipeline(claimInserts, ledgerInserts, {
        claims: [
          { reason: 'sale', revision: 0 },
          { reason: 'void', revision: 0 },
        ],
      }),
    )

    // Act
    await redepleteOrderStockBestEffort(TENANT, ORDER)

    // Assert
    expect(claimInserts).toContainEqual(
      expect.objectContaining({ reason: 'sale', revision: 1, order_id: ORDER }),
    )
  })

  it('writes the depletion rows again from the order\'s own saved lines', async () => {
    const claimInserts: Record<string, unknown>[] = []
    const ledgerInserts: Record<string, unknown>[] = []
    from.mockImplementation(
      stubPipeline(claimInserts, ledgerInserts, {
        claims: [
          { reason: 'sale', revision: 0 },
          { reason: 'void', revision: 0 },
        ],
      }),
    )

    await redepleteOrderStockBestEffort(TENANT, ORDER)

    // 2 × 100 g of flour, spent again for the re-activated order.
    expect(ledgerInserts).toContainEqual(
      expect.objectContaining({
        inventory_item_id: FLOUR,
        reason: 'sale',
        quantity_delta: -200,
        order_id: ORDER,
      }),
    )
  })

  it('never throws when the order read fails (best-effort)', async () => {
    const claimInserts: Record<string, unknown>[] = []
    const ledgerInserts: Record<string, unknown>[] = []
    from.mockImplementation(
      stubPipeline(claimInserts, ledgerInserts, { orderReadError: { message: 'boom' } }),
    )

    await expect(redepleteOrderStockBestEffort(TENANT, ORDER)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
    expect(ledgerInserts).toEqual([])
  })

  it('moves nothing for an order whose lines are all deleted dishes', async () => {
    const claimInserts: Record<string, unknown>[] = []
    const ledgerInserts: Record<string, unknown>[] = []
    from.mockImplementation(
      stubPipeline(claimInserts, ledgerInserts, {
        orderItems: [{ menu_item_id: null, quantity: 2 }],
      }),
    )

    await redepleteOrderStockBestEffort(TENANT, ORDER)

    expect(claimInserts).toEqual([])
    expect(ledgerInserts).toEqual([])
  })
})

describe('a second cancellation after an un-cancel', () => {
  it('claims its void at a fresh revision and restores the re-deducted amount', async () => {
    // Arrange — sold (sale@0), cancelled (void@0, +200 written back),
    // un-cancelled (sale@1, -200 spent again). The ledger nets to -200.
    const claimInserts: Record<string, unknown>[] = []
    const ledgerInserts: Record<string, unknown>[] = []
    from.mockImplementation(
      stubPipeline(claimInserts, ledgerInserts, {
        claims: [
          { reason: 'sale', revision: 0 },
          { reason: 'void', revision: 0 },
          { reason: 'sale', revision: 1 },
        ],
        movements: [
          { inventory_item_id: FLOUR, outlet_id: null, quantity_delta: -200, entered_quantity: 200, entered_unit_id: GRAM },
          { inventory_item_id: FLOUR, outlet_id: null, quantity_delta: 200, entered_quantity: 200, entered_unit_id: GRAM },
          { inventory_item_id: FLOUR, outlet_id: null, quantity_delta: -200, entered_quantity: 200, entered_unit_id: GRAM },
        ],
      }),
    )

    // Act
    const result = await reverseOrderStockMovements(TENANT, ORDER)

    // Assert — the void claim does NOT collide with the burned void@0, and the
    // reversal returns exactly the net the un-cancel re-spent.
    expect(claimInserts).toContainEqual(
      expect.objectContaining({ reason: 'void', revision: 1 }),
    )
    expect(result.movementCount).toBe(1)
    expect(ledgerInserts).toContainEqual(
      expect.objectContaining({ inventory_item_id: FLOUR, reason: 'void', quantity_delta: 200 }),
    )
  })
})

describe('revision arithmetic (pure)', () => {
  it('re-depletes at revision 0 for an order with no claims at all', () => {
    expect(resolveRedepletionRevision([])).toBe(0)
  })

  it('re-depletes one above the highest claim in either direction', () => {
    expect(
      resolveRedepletionRevision([
        { reason: 'sale', revision: 0 },
        { reason: 'void', revision: 2 },
      ]),
    ).toBe(3)
  })

  it('pairs a first cancel with the latest sale revision', () => {
    expect(resolveVoidClaimRevision([{ reason: 'sale', revision: 0 }])).toBe(0)
  })

  it('skips past a void an order edit already claimed', () => {
    // A swap edit claims both sale@1 and void@1; the cancel must not collide.
    expect(
      resolveVoidClaimRevision([
        { reason: 'sale', revision: 0 },
        { reason: 'sale', revision: 1 },
        { reason: 'void', revision: 1 },
      ]),
    ).toBe(2)
  })

  it('claims void at 0 for an order that never depleted', () => {
    expect(resolveVoidClaimRevision([])).toBe(0)
  })

  it('blocks a sale when a void exists at or above its revision', () => {
    expect(hasBlockingVoidClaim([{ reason: 'void', revision: 0 }], 0)).toBe(true)
    expect(hasBlockingVoidClaim([{ reason: 'void', revision: 2 }], 0)).toBe(true)
    expect(hasBlockingVoidClaim([{ reason: 'void', revision: 0 }], 1)).toBe(false)
    expect(hasBlockingVoidClaim([{ reason: 'sale', revision: 0 }], 0)).toBe(false)
  })
})

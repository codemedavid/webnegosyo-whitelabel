/**
 * Phase 5B — the alert path has to be reached from every writer of the ledger,
 * not just one.
 *
 * Stock is moved by two code paths: a merchant recording a delivery or a
 * stocktake by hand, and an order depleting ingredients. An alert wired into
 * only one of them would go quiet exactly when a shop is busiest, which is the
 * one time it matters.
 */

import { applyOrderStockMovements } from '@/lib/inventory/order-stock-service'
import { recordStockMovement } from '@/lib/inventory/stock-service'
import { processStockLevelChanges } from '@/lib/inventory/stock-alerts-service'

jest.mock('@/lib/inventory/stock-alerts-service', () => ({
  processStockLevelChanges: jest.fn(() =>
    Promise.resolve({ alertsRaised: 0, alertsResolved: 0, menuItemsDisabled: [] }),
  ),
}))

const from = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (...a: unknown[]) => from(...a) }),
}))
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ from: (...a: unknown[]) => from(...a) }),
}))
jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: jest.fn(() => Promise.resolve()),
}))

/** Chainable, thenable Supabase stub — resolves `data` however long the chain. */
function table(data: unknown) {
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve({ data, error: null }),
  }
  for (const method of ['select', 'eq', 'is', 'in', 'insert', 'update', 'single', 'limit']) {
    chain[method] = () => chain
  }
  return chain
}

const GRAMS = {
  id: 'unit-g',
  name: 'Gram',
  abbreviation: 'g',
  dimension: 'weight',
  to_base_factor: 1,
  tenant_id: 't1',
}

const FLOUR = {
  id: 'flour',
  tenant_id: 't1',
  name: 'Flour',
  current_qty: 25,
  reorder_level: 20,
  is_active: true,
  stock_unit_id: 'unit-g',
  unit_cost: 1,
  is_prep: false,
}

const mockedProcess = processStockLevelChanges as jest.MockedFunction<
  typeof processStockLevelChanges
>

beforeEach(() => {
  from.mockReset()
  mockedProcess.mockClear()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('order depletion reaches the alert path', () => {
  function wireDepletion() {
    from.mockImplementation((name: string) => {
      switch (name) {
        case 'stock_movements':
          return table([])
        case 'recipes':
          return table([
            { id: 'r-base', tenant_id: 't1', target_type: 'menu_item', menu_item_id: 'm1' },
          ])
        case 'recipe_components':
          return table([
            {
              id: 'c1',
              tenant_id: 't1',
              recipe_id: 'r-base',
              inventory_item_id: 'flour',
              quantity: 10,
              unit_id: 'unit-g',
              sort_order: 0,
            },
          ])
        case 'inventory_items':
          return table([FLOUR])
        case 'inventory_units':
          return table([GRAMS])
        default:
          return table([])
      }
    })
  }

  it('reports the pre-movement ingredients and the deltas an order applied', async () => {
    wireDepletion()

    await applyOrderStockMovements('t1', 'order-1', [{ menuItemId: 'm1', quantity: 1 }], 'sale')

    expect(mockedProcess).toHaveBeenCalledTimes(1)
    const [tenantId, items, deltas] = mockedProcess.mock.calls[0]
    expect(tenantId).toBe('t1')
    // The rows as they stood BEFORE the movement — the crossing is the
    // difference between that and the delta, so a post-write re-read would
    // race the running-total trigger and detect nothing.
    expect(items).toEqual([expect.objectContaining({ id: 'flour', current_qty: 25 })])
    expect(deltas.get('flour')).toBe(-10)
  })

  it('sums the deltas when several lines share one ingredient', async () => {
    wireDepletion()

    await applyOrderStockMovements('t1', 'order-1', [{ menuItemId: 'm1', quantity: 3 }], 'sale')

    expect(mockedProcess.mock.calls[0][2].get('flour')).toBe(-30)
  })

  it('does not run the alert path when an order moved no stock', async () => {
    from.mockImplementation(() => table([]))

    await applyOrderStockMovements('t1', 'order-1', [{ menuItemId: 'm1', quantity: 1 }], 'sale')

    expect(mockedProcess).not.toHaveBeenCalled()
  })

  it('still records the order movements when the alert path throws', async () => {
    // Alerting is downstream of a sale that has already happened.
    wireDepletion()
    mockedProcess.mockRejectedValueOnce(new Error('alerts are down'))

    const result = await applyOrderStockMovements(
      't1',
      'order-1',
      [{ menuItemId: 'm1', quantity: 1 }],
      'sale',
    )

    expect(result.movementCount).toBe(1)
  })
})

describe('manual movements reach the alert path', () => {
  it('reports the ingredient and delta a merchant-recorded waste applied', async () => {
    from.mockImplementation((name: string) => {
      switch (name) {
        case 'inventory_items':
          return table(FLOUR)
        case 'inventory_units':
          return table([GRAMS])
        default:
          return table({ id: 'mv-1' })
      }
    })

    await recordStockMovement('t1', {
      inventory_item_id: 'flour',
      reason: 'waste',
      quantity: 10,
      unit_id: 'unit-g',
    })

    expect(mockedProcess).toHaveBeenCalledTimes(1)
    const [tenantId, items, deltas] = mockedProcess.mock.calls[0]
    expect(tenantId).toBe('t1')
    expect(items).toEqual([expect.objectContaining({ id: 'flour', current_qty: 25 })])
    expect(deltas.get('flour')).toBe(-10)
  })
})

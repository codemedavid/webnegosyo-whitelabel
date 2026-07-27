/**
 * Phase 5B — the alert path has to be reached from every writer of the ledger,
 * not just one.
 *
 * Stock is moved by THREE code paths: a merchant recording a delivery or a
 * stocktake by hand, an order depleting ingredients, and a cancelled order
 * putting them back. An alert wired into only one of them would go quiet
 * exactly when a shop is busiest, which is the one time it matters.
 *
 * Phase 7 added the third. Cancellation restores stock but was silent to the
 * alert path, so an order that emptied an ingredient — closing the shop's
 * bestseller by auto-86 — left the dish hidden and the alert open even after
 * the cancellation put every gram back.
 */

import {
  applyOrderStockMovements,
  reverseOrderStockMovements,
} from '@/lib/inventory/order-stock-service'
import { recordStockMovement } from '@/lib/inventory/stock-service'
import { processStockLevelChanges } from '@/lib/inventory/stock-alerts-service'

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

describe('cancellation restore reaches the alert path', () => {
  /**
   * Restore reads `stock_movements` twice before writing — once for the sale it
   * is reversing, once to check it has not already run — so this hands out a
   * different answer per call rather than the same rows to both.
   */
  function wireRestore(saleRows: unknown[], alreadyRestored: unknown[] = []) {
    const movementAnswers = [saleRows, alreadyRestored]
    let movementCall = 0
    from.mockImplementation((name: string) => {
      switch (name) {
        case 'stock_movements':
          return table(movementAnswers[movementCall++] ?? [])
        case 'inventory_items':
          // Emptied by the sale this cancellation is reversing.
          return table([{ ...FLOUR, current_qty: 0 }])
        case 'inventory_units':
          return table([GRAMS])
        default:
          return table([])
      }
    })
  }

  const SALE = {
    inventory_item_id: 'flour',
    quantity_delta: -10,
    entered_quantity: 10,
    entered_unit_id: 'unit-g',
  }

  it('reports the pre-restore ingredients and the deltas the cancellation gave back', async () => {
    wireRestore([SALE])

    await reverseOrderStockMovements('t1', 'order-1')

    expect(mockedProcess).toHaveBeenCalledTimes(1)
    const [tenantId, items, deltas] = mockedProcess.mock.calls[0]
    expect(tenantId).toBe('t1')
    // Same contract as depletion: the rows as they stood BEFORE the reversal,
    // because the running-total trigger has not settled yet.
    expect(items).toEqual([expect.objectContaining({ id: 'flour', current_qty: 0 })])
    // Positive — this is the movement that can resolve an alert and bring an
    // auto-86'd dish back, the mirror of the sale that raised it.
    expect(deltas.get('flour')).toBe(10)
  })

  it('sums the deltas when the sale recorded one ingredient on several lines', async () => {
    wireRestore([SALE, { ...SALE, quantity_delta: -4 }])

    await reverseOrderStockMovements('t1', 'order-1')

    expect(mockedProcess.mock.calls[0][2].get('flour')).toBe(14)
  })

  it('does not run the alert path when there was no sale to reverse', async () => {
    wireRestore([])

    await reverseOrderStockMovements('t1', 'order-1')

    expect(mockedProcess).not.toHaveBeenCalled()
  })

  it('does not run the alert path when the order was already restored', async () => {
    // Otherwise a retried cancellation would re-report a delta it never applied.
    wireRestore([SALE], [{ id: 'mv-void' }])

    await reverseOrderStockMovements('t1', 'order-1')

    expect(mockedProcess).not.toHaveBeenCalled()
  })

  it('still records the restoring movements when the alert path throws', async () => {
    wireRestore([SALE])
    mockedProcess.mockRejectedValueOnce(new Error('alerts are down'))

    const result = await reverseOrderStockMovements('t1', 'order-1')

    expect(result.movementCount).toBe(1)
  })
})

describe('manual movements reach the alert path', () => {
  // The manual path validates its input as UUIDs, unlike depletion, which is
  // fed ids the server already resolved.
  const FLOUR_ID = '11111111-1111-4111-8111-111111111111'
  const GRAM_ID = '22222222-2222-4222-8222-222222222222'

  it('reports the ingredient and delta a merchant-recorded waste applied', async () => {
    from.mockImplementation((name: string) => {
      switch (name) {
        case 'inventory_items':
          return table({ ...FLOUR, id: FLOUR_ID, stock_unit_id: GRAM_ID })
        case 'inventory_units':
          return table([{ ...GRAMS, id: GRAM_ID }])
        default:
          return table({ id: 'mv-1' })
      }
    })

    await recordStockMovement('t1', {
      inventory_item_id: FLOUR_ID,
      reason: 'waste',
      quantity: 10,
      unit_id: GRAM_ID,
    })

    expect(mockedProcess).toHaveBeenCalledTimes(1)
    const [tenantId, items, deltas] = mockedProcess.mock.calls[0]
    expect(tenantId).toBe('t1')
    expect(items).toEqual([expect.objectContaining({ id: FLOUR_ID, current_qty: 25 })])
    expect(deltas.get(FLOUR_ID)).toBe(-10)
  })
})

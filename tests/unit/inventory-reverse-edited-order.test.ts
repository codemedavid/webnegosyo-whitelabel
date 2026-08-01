/**
 * Cancelling an order that was EDITED after it was placed.
 *
 * Restore derives itself from the recorded movements rather than recomputing
 * from the order's lines — that part is proven in
 * `inventory-order-stock-reverse.test.ts`. But it derived itself from the
 * `sale` movements ONLY, which was correct exactly as long as a sale was the
 * only thing an order could record.
 *
 * Order editing breaks that. An edit that removes an item writes a `void`
 * correction putting those ingredients back while the order is still live. A
 * cancellation that then reverses the sale rows alone returns ingredients that
 * were already returned, and the shelf ends up holding stock that never
 * existed — an over-restore, which auto-86 will happily un-hide dishes on.
 *
 * The reversal has to net every movement the order recorded, in both
 * directions.
 */

import { reverseOrderStockMovements } from '@/lib/inventory/order-stock-service'

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

interface MovementRow {
  inventory_item_id: string
  reason: string
  quantity_delta: number
  entered_quantity: number | null
  entered_unit_id: string | null
}

/**
 * A ledger stub that HONOURS `.eq('reason', …)`.
 *
 * The existing reverse test's stub returns its rows whatever is asked for, so
 * it cannot tell a query that filters by reason from one that does not. That is
 * precisely the difference under test here, so this stub tracks the filters.
 */
function stubLedger(rows: MovementRow[], captured: unknown[][]) {
  return (table: string) => {
    if (table === 'order_stock_applications') {
      return {
        insert: () => Promise.resolve({ data: null, error: null }),
        delete: () => ({
          eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
        }),
      }
    }

    if (table === 'inventory_items') {
      return {
        select: () => {
          const chain = {
            eq: () => chain,
            in: () => chain,
            then: (resolve: (r: unknown) => unknown) => resolve({ data: [], error: null }),
          }
          return chain
        },
      }
    }

    return {
      select: () => {
        const filters: Record<string, unknown> = {}
        const chain = {
          eq: (column: string, value: unknown) => {
            filters[column] = value
            return chain
          },
          in: () => chain,
          then: (resolve: (r: unknown) => unknown) => {
            const matching =
              filters.reason === undefined
                ? rows
                : rows.filter((row) => row.reason === filters.reason)
            return resolve({ data: matching, error: null })
          },
        }
        return chain
      },
      insert: (inserted: unknown[]) => {
        captured.push(inserted)
        return Promise.resolve({ data: inserted, error: null })
      },
    }
  }
}

/**
 * An order that sold 600 g of flour, then had an item removed by an edit which
 * put 200 g back. Only 400 g is actually spent.
 */
const EDITED_ORDER: MovementRow[] = [
  {
    inventory_item_id: 'ing-flour',
    reason: 'sale',
    quantity_delta: -600,
    entered_quantity: 600,
    entered_unit_id: 'g',
  },
  {
    inventory_item_id: 'ing-flour',
    reason: 'void',
    quantity_delta: 200,
    entered_quantity: 200,
    entered_unit_id: 'g',
  },
]

beforeEach(() => {
  from.mockReset()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('reverseOrderStockMovements on an edited order', () => {
  it('returns only what the order actually spent', async () => {
    const captured: unknown[][] = []
    from.mockImplementation(stubLedger(EDITED_ORDER, captured))

    await reverseOrderStockMovements('tenant-1', 'order-1')

    const rows = captured[0] as MovementRow[]
    const flour = rows.filter((row) => row.inventory_item_id === 'ing-flour')

    // 600 spent, 200 already returned by the edit. Reversing the sale alone
    // would put back 600 and invent 200 g of flour.
    expect(flour.reduce((sum, row) => sum + row.quantity_delta, 0)).toBe(400)
  })

  it('writes one netted row per ingredient rather than one per movement', async () => {
    const captured: unknown[][] = []
    from.mockImplementation(stubLedger(EDITED_ORDER, captured))

    await reverseOrderStockMovements('tenant-1', 'order-1')

    expect((captured[0] as MovementRow[]).length).toBe(1)
  })

  it('still reverses an unedited order exactly', async () => {
    // The ordinary case must not regress: one sale row, one equal-and-opposite
    // reversal.
    const captured: unknown[][] = []
    from.mockImplementation(
      stubLedger(
        [
          {
            inventory_item_id: 'ing-cheese',
            reason: 'sale',
            quantity_delta: -80,
            entered_quantity: 80,
            entered_unit_id: 'g',
          },
        ],
        captured,
      ),
    )

    await reverseOrderStockMovements('tenant-1', 'order-2')

    const rows = captured[0] as MovementRow[]
    expect(rows).toHaveLength(1)
    expect(rows[0].quantity_delta).toBe(80)
    expect(rows[0].reason).toBe('void')
  })

  it('writes nothing for an ingredient an edit already fully returned', async () => {
    // Sold, then the whole line removed by an edit. Nothing is left to give
    // back, and a zero-delta ledger row is noise that reads as a real event.
    const captured: unknown[][] = []
    from.mockImplementation(
      stubLedger(
        [
          {
            inventory_item_id: 'ing-flour',
            reason: 'sale',
            quantity_delta: -600,
            entered_quantity: 600,
            entered_unit_id: 'g',
          },
          {
            inventory_item_id: 'ing-flour',
            reason: 'void',
            quantity_delta: 600,
            entered_quantity: 600,
            entered_unit_id: 'g',
          },
        ],
        captured,
      ),
    )

    await reverseOrderStockMovements('tenant-1', 'order-3')

    expect(captured[0] ?? []).toHaveLength(0)
  })
})

/**
 * The low-stock banner and the quantities beneath it must agree.
 *
 * `stock_alerts` rows are raised store-wide, from the roll-up across every
 * branch — they carry no branch of their own. The inventory screen, meanwhile,
 * shows a branch manager THEIR shelf. Pairing the two unfiltered put the
 * chain's warnings above one branch's figures, so a manager with a full shelf
 * was told to reorder by a banner sitting directly above the number that
 * contradicted it.
 */

import { scopeStockAlerts } from '@/lib/inventory/stock-alerts-view'
import type { StockAlertView } from '@/lib/inventory/stock-alerts-view'

const alert = (overrides: Partial<StockAlertView> = {}): StockAlertView => ({
  id: 'a1',
  inventoryItemId: 'beef',
  name: 'Beef',
  level: 'low',
  quantity: 400,
  reorderLevel: 500,
  unitAbbreviation: 'g',
  createdAt: '2026-08-10T00:00:00.000Z',
  ...overrides,
})

describe('the low-stock banner belongs to the shelf underneath it', () => {
  test('a branch holding plenty is not shown the chain-wide warning', () => {
    // Arrange — the chain is short of beef, so an alert row exists. This
    // branch, however, has 900g against a 500g par: their shelf is fine.
    const alerts = [alert()]
    const branchItems = [{ id: 'beef', current_qty: 900, reorder_level: 500 }]

    // Act
    const scoped = scopeStockAlerts(alerts, branchItems)

    // Assert — the banner and the quantities under it now agree. Before this,
    // a manager with a full shelf was told to reorder by a banner sitting
    // directly above the number that contradicted it.
    expect(scoped).toEqual([])
  })

  test('a branch that is genuinely short still sees the warning', () => {
    const scoped = scopeStockAlerts(
      [alert()],
      [{ id: 'beef', current_qty: 100, reorder_level: 500 }],
    )

    expect(scoped).toHaveLength(1)
    expect(scoped[0].inventoryItemId).toBe('beef')
  })

  test('exactly at the reorder level still counts as short', () => {
    // The boundary is inclusive everywhere else in the stock layer, and a par
    // level is the point at which you reorder, not the point after it.
    const scoped = scopeStockAlerts(
      [alert()],
      [{ id: 'beef', current_qty: 500, reorder_level: 500 }],
    )

    expect(scoped).toHaveLength(1)
  })

  test('a store-wide viewer keeps every alert, because their figures are the roll-up', () => {
    // The owner passes `inventory_items` straight in — `current_qty` there is
    // already the sum across branches, which is the figure the alert was
    // raised from. So the filter is a no-op for them by construction.
    const alerts = [alert(), alert({ id: 'a2', inventoryItemId: 'flour', name: 'Flour' })]
    const rollUp = [
      { id: 'beef', current_qty: 400, reorder_level: 500 },
      { id: 'flour', current_qty: 10, reorder_level: 500 },
    ]

    expect(scopeStockAlerts(alerts, rollUp)).toHaveLength(2)
  })

  test('an alert for an ingredient the viewer cannot see is dropped', () => {
    // Unactionable: there is no row on their screen to act on.
    expect(scopeStockAlerts([alert()], [])).toEqual([])
  })
})

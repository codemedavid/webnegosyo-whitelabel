/**
 * Phase 5B follow-up — presenting open stock alerts.
 *
 * A merchant opening the inventory page mid-service needs the list ordered by
 * what will stop them serving first, not by whatever order the database
 * returned. Exhausted ingredients outrank merely-low ones, and within a level
 * the oldest alert is the one that has gone unaddressed longest.
 *
 * Pure, like the rest of the 5B core, so the web admin and the merchant app
 * order and word the same list identically.
 */

import {
  sortStockAlerts,
  summarizeStockAlerts,
  describeStockAlert,
  scopeStockAlerts,
  type StockAlertView,
} from '@/lib/inventory/stock-alerts-view'

function alert(overrides: Partial<StockAlertView> = {}): StockAlertView {
  return {
    id: 'a1',
    inventoryItemId: 'flour',
    name: 'Flour',
    level: 'low',
    quantity: 5,
    reorderLevel: 20,
    unitAbbreviation: 'kg',
    createdAt: '2026-07-27T10:00:00.000Z',
    ...overrides,
  }
}

describe('sortStockAlerts', () => {
  it('puts exhausted ingredients above merely-low ones', () => {
    const alerts = [
      alert({ id: 'low-1', level: 'low' }),
      alert({ id: 'out-1', level: 'out', quantity: 0 }),
    ]

    expect(sortStockAlerts(alerts).map((a) => a.id)).toEqual(['out-1', 'low-1'])
  })

  it('puts the longest-unaddressed alert first within a level', () => {
    const alerts = [
      alert({ id: 'newer', createdAt: '2026-07-27T12:00:00.000Z' }),
      alert({ id: 'older', createdAt: '2026-07-27T08:00:00.000Z' }),
    ]

    expect(sortStockAlerts(alerts).map((a) => a.id)).toEqual(['older', 'newer'])
  })

  it('orders by level before age, so a fresh outage outranks an old warning', () => {
    const alerts = [
      alert({ id: 'old-low', level: 'low', createdAt: '2026-07-20T08:00:00.000Z' }),
      alert({ id: 'new-out', level: 'out', createdAt: '2026-07-27T18:00:00.000Z' }),
    ]

    expect(sortStockAlerts(alerts).map((a) => a.id)).toEqual(['new-out', 'old-low'])
  })

  it('does not mutate the list it was given', () => {
    // The caller holds this array in React state.
    const alerts = [alert({ id: 'low-1', level: 'low' }), alert({ id: 'out-1', level: 'out' })]
    const original = [...alerts]

    sortStockAlerts(alerts)

    expect(alerts).toEqual(original)
  })

  it('returns an empty list unchanged', () => {
    expect(sortStockAlerts([])).toEqual([])
  })
})

describe('summarizeStockAlerts', () => {
  it('counts nothing when there are no alerts', () => {
    expect(summarizeStockAlerts([])).toEqual({ outCount: 0, lowCount: 0, total: 0, headline: '' })
  })

  it('reports a single exhausted ingredient in the singular', () => {
    const summary = summarizeStockAlerts([alert({ level: 'out' })])

    expect(summary).toMatchObject({ outCount: 1, lowCount: 0, total: 1 })
    expect(summary.headline).toBe('1 ingredient out of stock')
  })

  it('reports a single low ingredient in the singular', () => {
    const summary = summarizeStockAlerts([alert({ level: 'low' })])

    expect(summary.headline).toBe('1 ingredient running low')
  })

  it('pluralises counts above one', () => {
    const summary = summarizeStockAlerts([
      alert({ id: 'a', level: 'out' }),
      alert({ id: 'b', level: 'out' }),
    ])

    expect(summary.headline).toBe('2 ingredients out of stock')
  })

  it('leads with the outages when both levels are present', () => {
    const summary = summarizeStockAlerts([
      alert({ id: 'a', level: 'low' }),
      alert({ id: 'b', level: 'out' }),
      alert({ id: 'c', level: 'low' }),
    ])

    expect(summary).toMatchObject({ outCount: 1, lowCount: 2, total: 3 })
    expect(summary.headline).toBe('1 ingredient out of stock, 2 running low')
  })
})

describe('describeStockAlert', () => {
  it('says an exhausted ingredient is out, without a quantity', () => {
    // "0 kg left" reads as a measurement; "out of stock" reads as a problem.
    expect(describeStockAlert(alert({ name: 'Flour', level: 'out', quantity: 0 }))).toBe(
      'Flour is out of stock',
    )
  })

  it('gives the remaining amount and the threshold for a low ingredient', () => {
    expect(
      describeStockAlert(
        alert({ name: 'Flour', level: 'low', quantity: 5, reorderLevel: 20, unitAbbreviation: 'kg' }),
      ),
    ).toBe('Flour is down to 5 kg (reorder at 20 kg)')
  })

  it('trims the trailing zeros a NUMERIC round-trip leaves behind', () => {
    expect(
      describeStockAlert(alert({ name: 'Flour', quantity: 5.5, reorderLevel: 20.25 })),
    ).toBe('Flour is down to 5.5 kg (reorder at 20.25 kg)')
  })

  it('reads correctly when the ingredient has no unit to show', () => {
    expect(
      describeStockAlert(alert({ name: 'Napkins', quantity: 12, reorderLevel: 50, unitAbbreviation: '' })),
    ).toBe('Napkins is down to 12 (reorder at 50)')
  })

  it('describes negative stock as out rather than as a negative amount', () => {
    // Stock goes negative when a sale lands before its delivery is recorded.
    expect(describeStockAlert(alert({ name: 'Flour', level: 'out', quantity: -3 }))).toBe(
      'Flour is out of stock',
    )
  })
})

describe('an alert that names a branch', () => {
  /**
   * Phase C started stamping alerts with the branch they are about. Two things
   * follow that the view did not yet do.
   */
  const alert = (over: Partial<StockAlertView> = {}): StockAlertView => ({
    id: 'a1',
    inventoryItemId: 'flour',
    name: 'Flour',
    level: 'out',
    quantity: 0,
    reorderLevel: 20,
    unitAbbreviation: 'g',
    createdAt: '2026-07-31T00:00:00.000Z',
    outletId: null,
    ...over,
  })

  it('says whose shelf it is about', () => {
    // "Flour is out of stock" across a two-shop chain leaves the merchant
    // asking the one question the alert exists to answer.
    expect(describeStockAlert(alert({ outletId: 'o-south', branchName: 'South' }))).toBe(
      'Flour is out of stock at South',
    )
  })

  it('names the branch on a low alert too', () => {
    expect(
      describeStockAlert(
        alert({ level: 'low', quantity: 5, outletId: 'o-south', branchName: 'South' }),
      ),
    ).toBe('Flour is down to 5 g (reorder at 20 g) at South')
  })

  it('says nothing extra for a store-wide alert', () => {
    // Every alert raised before branches existed, and every single-shop tenant.
    expect(describeStockAlert(alert())).toBe('Flour is out of stock')
  })

  it('does not invent a branch name it was not given', () => {
    // A deleted outlet, or a read that could not resolve the name. Better to
    // say less than to print a UUID at a merchant.
    expect(describeStockAlert(alert({ outletId: 'o-gone' }))).toBe('Flour is out of stock')
  })
})

describe('scopeStockAlerts with branch-stamped alerts', () => {
  const alert = (over: Partial<StockAlertView> = {}): StockAlertView => ({
    id: 'a1',
    inventoryItemId: 'flour',
    name: 'Flour',
    level: 'out',
    quantity: 0,
    reorderLevel: 20,
    unitAbbreviation: 'g',
    createdAt: '2026-07-31T00:00:00.000Z',
    outletId: null,
    ...over,
  })

  it('keeps a branch alert even when the chain roll-up looks healthy', () => {
    // The regression Phase C introduced. South is out; the owner's screen shows
    // the roll-up, 700g, which is far above the reorder level -- so the re-test
    // threw away the alert that had just been correctly raised. The branch
    // figure was the basis for raising it, and the owner's total is the wrong
    // yardstick to re-judge it by.
    const kept = scopeStockAlerts(
      [alert({ outletId: 'o-south', branchName: 'South' })],
      [{ id: 'flour', current_qty: 700, reorder_level: 20 }],
    )

    expect(kept).toHaveLength(1)
  })

  it('still drops a branch alert for an ingredient the viewer cannot see', () => {
    // Absent from the list means invisible to this account, and an alert about
    // something invisible is unactionable whatever branch raised it.
    expect(
      scopeStockAlerts([alert({ outletId: 'o-south', branchName: 'South' })], []),
    ).toEqual([])
  })

  it('still re-tests a store-wide alert against the viewer figures', () => {
    // Unchanged: an unstamped alert carries no branch, so the viewer's own
    // quantities remain the only way to tell whether it is their problem.
    expect(
      scopeStockAlerts([alert()], [{ id: 'flour', current_qty: 700, reorder_level: 20 }]),
    ).toEqual([])
  })
})

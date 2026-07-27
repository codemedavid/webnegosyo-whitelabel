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

/**
 * Phase 2 — the food cost percentage on the screen.
 *
 * The panel already showed what the day's stock cost. These tests pin the half
 * that answers the merchant's actual question — whether the takings covered it —
 * and, more importantly, pin what the screen does when the takings are unknown.
 * A "0.0%" in that case would be the most flattering possible lie.
 */

import { render, screen } from '@testing-library/react'
import { DailyReportPanel } from '@/components/admin/daily-report-panel'
import { InventoryManager } from '@/components/admin/inventory-manager'
import type { DailyInventoryReportForDay } from '@/lib/inventory/daily-report-read'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

function report(overrides: Partial<DailyInventoryReportForDay> = {}): DailyInventoryReportForDay {
  return {
    dayKey: '2026-07-29',
    rows: [],
    totals: { cogs: 300, wasteCost: 0, shrinkageCost: 0 },
    countedCount: 0,
    uncountedCount: 0,
    uncostedCount: 0,
    // Null, not an abandoned count: this fixture is a day nobody opened a
    // session for, which is what every day before sessions looks like.
    countSession: null,
    ...overrides,
  }
}

function renderPanel(props: { revenue?: number | null } = {}) {
  return render(
    <DailyReportPanel
      tenantSlug="acme"
      report={report()}
      latestDayKey="2026-07-30"
      {...props}
    />,
  )
}

describe('DailyReportPanel — takings and food cost', () => {
  test('shows the day\'s takings alongside the stock cost', () => {
    renderPanel({ revenue: 1000 })

    expect(screen.getByTestId('daily-report-total-revenue')).toHaveTextContent('₱1,000.00')
  })

  test('shows the stock cost as a share of the takings', () => {
    // Arrange: ₱300 of stock against ₱1,000 of sales.
    // Act
    renderPanel({ revenue: 1000 })

    // Assert
    expect(screen.getByTestId('daily-report-food-cost')).toHaveTextContent('30.0%')
  })

  test('never prints a percentage when the takings could not be read', () => {
    // The regression this whole phase exists to prevent: an unreachable order
    // backend must not render as a flawless food cost.
    renderPanel({ revenue: null })

    expect(screen.queryByText(/0\.0%/)).not.toBeInTheDocument()
  })

  test('explains that the takings could not be read', () => {
    renderPanel({ revenue: null })

    expect(screen.getByText(/could not be read/)).toBeInTheDocument()
  })

  test('distinguishes a day with no sales from a day it could not read', () => {
    renderPanel({ revenue: 0 })

    expect(screen.getByText(/No sales were recorded/)).toBeInTheDocument()
    expect(screen.queryByText(/could not be read/)).not.toBeInTheDocument()
  })

  test('still reports the stock cost when the takings are unknown', () => {
    // Revenue is one card. Losing it must not cost the merchant the figures
    // that were read successfully.
    renderPanel({ revenue: null })

    expect(screen.getByTestId('daily-report-total-cogs')).toHaveTextContent('₱300.00')
  })

  test('omits the takings entirely when no revenue was supplied at all', () => {
    // Back-compatible: a caller that knows nothing about revenue gets the
    // original three-card report, not an alarming "could not be read".
    renderPanel()

    expect(screen.queryByTestId('daily-report-total-revenue')).not.toBeInTheDocument()
    expect(screen.queryByText(/could not be read/)).not.toBeInTheDocument()
  })
})

describe('InventoryManager — revenue passthrough', () => {
  test('hands the day\'s takings to the report', () => {
    render(
      <InventoryManager
        tenantId="t1"
        tenantSlug="acme"
        initialIngredients={[] as unknown as InventoryItem[]}
        initialUnits={[] as unknown as InventoryUnitRow[]}
        dailyReport={report()}
        dailyRevenue={1000}
        latestDayKey="2026-07-30"
        defaultTab="reports"
      />,
    )

    expect(screen.getByTestId('daily-report-food-cost')).toHaveTextContent('30.0%')
  })
})

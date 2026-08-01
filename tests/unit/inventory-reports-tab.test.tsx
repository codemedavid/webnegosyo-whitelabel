/**
 * Phase 1c — the Reports tab existing at all.
 *
 * The report has been computed and correct and completely unreachable: the read
 * layer had no caller and no tab offered it. These tests pin the reachability,
 * not the contents — the panel's own suite covers what it renders.
 */

import { render, screen } from '@testing-library/react'
import { InventoryManager } from '@/components/admin/inventory-manager'
import type { DailyInventoryReportForDay } from '@/lib/inventory/daily-report-read'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

const UNITS = [
  { id: 'unit-g', tenant_id: 't1', name: 'gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 },
] as unknown as InventoryUnitRow[]

const INGREDIENTS = [] as unknown as InventoryItem[]

function dailyReport(
  overrides: Partial<DailyInventoryReportForDay> = {},
): DailyInventoryReportForDay {
  return {
    dayKey: '2026-07-29',
    rows: [],
    totals: { cogs: 0, wasteCost: 0, shrinkageCost: 0 },
    countedCount: 0,
    uncountedCount: 0,
    uncostedCount: 0,
    ...overrides,
  }
}

function renderManager(props: Record<string, unknown> = {}) {
  return render(
    <InventoryManager
      tenantId="t1"
      tenantSlug="acme"
      initialIngredients={INGREDIENTS}
      initialUnits={UNITS}
      {...props}
    />,
  )
}

describe('InventoryManager reports tab', () => {
  test('offers a Reports tab once a report is supplied', () => {
    renderManager({ dailyReport: dailyReport(), latestDayKey: '2026-07-30' })

    expect(screen.getByRole('tab', { name: 'Reports' })).toBeInTheDocument()
  })

  test('opens straight onto the report when the URL asked for it', () => {
    // The day links carry `tab=reports`; without this the merchant steps a day
    // and lands back on a different tab, which reads as a broken link.
    renderManager({
      dailyReport: dailyReport(),
      latestDayKey: '2026-07-30',
      defaultTab: 'reports',
    })

    expect(screen.getByText('Wed, 29 Jul 2026')).toBeInTheDocument()
  })

  test('hides the tab entirely when no report was loaded', () => {
    // The surface degrades to the tabs that were always there rather than
    // showing an empty Reports tab that looks like a day with no trade.
    renderManager()

    expect(screen.queryByRole('tab', { name: 'Reports' })).not.toBeInTheDocument()
  })

  test('ignores an unknown tab in the URL rather than opening nothing', () => {
    renderManager({ dailyReport: dailyReport(), latestDayKey: '2026-07-30', defaultTab: 'nonsense' })

    expect(screen.getByRole('tab', { name: 'Ingredients' })).toBeInTheDocument()
  })
})

/**
 * Phase 3 — the verdict as the merchant sees it.
 *
 * The report already showed correct numbers. A verdict turns them into a claim,
 * which is more useful and more dangerous: these tests pin that the claim is
 * withheld, with a reason, whenever the day cannot honestly support one.
 */

import { render, screen } from '@testing-library/react'
import { DailyReportPanel } from '@/components/admin/daily-report-panel'
import { InventoryManager } from '@/components/admin/inventory-manager'
import type { DailyInventoryReportForDay } from '@/lib/inventory/daily-report-read'
import type { RecipeCoverageRow } from '@/lib/inventory/recipe-coverage'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

function report(overrides: Partial<DailyInventoryReportForDay> = {}): DailyInventoryReportForDay {
  return {
    dayKey: '2026-07-29',
    rows: [],
    totals: { cogs: 1000, wasteCost: 0, shrinkageCost: 10 },
    countedCount: 3,
    uncountedCount: 0,
    uncostedCount: 0,
    ...overrides,
  }
}

function renderPanel(props: {
  dishesWithRecipe?: number
  report?: DailyInventoryReportForDay
} = {}) {
  return render(
    <DailyReportPanel
      tenantSlug="acme"
      report={props.report ?? report()}
      latestDayKey="2026-07-30"
      dishesWithRecipe={props.dishesWithRecipe}
    />,
  )
}

describe('DailyReportPanel — the verdict', () => {
  test('states a verdict when the day can be judged', () => {
    renderPanel({ dishesWithRecipe: 10 })

    expect(screen.getByTestId('daily-report-verdict')).toHaveTextContent('well run')
  })

  test('shows the variance as a share of what the day used', () => {
    // ₱10 short against ₱1,000 used.
    renderPanel({ dishesWithRecipe: 10 })

    expect(screen.getByTestId('daily-report-verdict')).toHaveTextContent('1.0%')
  })

  test('withholds the verdict when no dish has a recipe', () => {
    // The brewdazeexpress shape: inventory on, dishes listed, no recipes. The
    // numbers are all zero and would otherwise grade as a flawless day.
    renderPanel({
      dishesWithRecipe: 0,
      report: report({ totals: { cogs: 0, wasteCost: 0, shrinkageCost: 0 }, countedCount: 0 }),
    })

    const verdict = screen.getByTestId('daily-report-verdict')

    expect(verdict).toHaveTextContent(/recipe/)
    expect(verdict).not.toHaveTextContent('well run')
  })

  test('never shows a percentage when it refused to judge', () => {
    renderPanel({
      dishesWithRecipe: 0,
      report: report({ totals: { cogs: 0, wasteCost: 0, shrinkageCost: 0 }, countedCount: 0 }),
    })

    expect(screen.getByTestId('daily-report-verdict')).not.toHaveTextContent('%')
  })

  test('withholds the verdict when nothing was counted', () => {
    renderPanel({ dishesWithRecipe: 10, report: report({ countedCount: 0 }) })

    expect(screen.getByTestId('daily-report-verdict')).toHaveTextContent(/count/)
  })

  test('still shows the day\'s figures when it cannot judge', () => {
    renderPanel({ dishesWithRecipe: 10, report: report({ countedCount: 0 }) })

    expect(screen.getByTestId('daily-report-total-cogs')).toHaveTextContent('₱1,000.00')
  })

  test('omits the verdict entirely when recipe coverage is unknown', () => {
    // Back-compatible: a caller that cannot say how many dishes have recipes
    // gets the plain report rather than a verdict built on a guess.
    renderPanel()

    expect(screen.queryByTestId('daily-report-verdict')).not.toBeInTheDocument()
  })
})

describe('InventoryManager — recipe coverage reaches the verdict', () => {
  const COVERAGE = [
    { menuItemId: 'm1', name: 'Latte', hasRecipe: true, ingredientCount: 2 },
    { menuItemId: 'm2', name: 'Muffin', hasRecipe: false, ingredientCount: 0 },
  ] as RecipeCoverageRow[]

  test('counts only the dishes that actually have a recipe', () => {
    render(
      <InventoryManager
        tenantId="t1"
        tenantSlug="acme"
        initialIngredients={[] as unknown as InventoryItem[]}
        initialUnits={[] as unknown as InventoryUnitRow[]}
        coverageRows={COVERAGE}
        dailyReport={report()}
        latestDayKey="2026-07-30"
        defaultTab="reports"
      />,
    )

    // One dish has a recipe, so the day is judgeable rather than refused.
    expect(screen.getByTestId('daily-report-verdict')).toHaveTextContent('well run')
  })

  test('refuses the verdict when no dish has a recipe', () => {
    render(
      <InventoryManager
        tenantId="t1"
        tenantSlug="acme"
        initialIngredients={[] as unknown as InventoryItem[]}
        initialUnits={[] as unknown as InventoryUnitRow[]}
        coverageRows={[{ ...COVERAGE[1] }] as RecipeCoverageRow[]}
        dailyReport={report()}
        latestDayKey="2026-07-30"
        defaultTab="reports"
      />,
    )

    expect(screen.getByTestId('daily-report-verdict')).toHaveTextContent(/recipe/)
  })
})

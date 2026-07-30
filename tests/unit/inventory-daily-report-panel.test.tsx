/**
 * Phase 1c — the screen.
 *
 * Everything the daily report computes has been correct and invisible: the read
 * layer had no caller and no merchant could see a peso of it. This is the
 * surface, and the point of the whole feature.
 *
 * The two behaviours that matter most here are not the numbers. They are that a
 * day nobody counted must SAY nobody counted it, and that an empty day must
 * read as "nothing moved" rather than as an empty table — otherwise a merchant
 * learns to read silence as good news.
 */

import { render, screen, within } from '@testing-library/react'
import { DailyReportPanel } from '@/components/admin/daily-report-panel'
import type { DailyReportRow } from '@/lib/inventory/daily-report'
import type { DailyInventoryReportForDay } from '@/lib/inventory/daily-report-read'

function row(overrides: Partial<DailyReportRow> = {}): DailyReportRow {
  return {
    inventoryItemId: 'flour',
    name: 'Flour',
    stockUnitAbbreviation: 'g',
    opening: 1000,
    received: 0,
    sold: 200,
    waste: 0,
    countAdjustment: 0,
    shrinkage: 0,
    closing: 800,
    cogs: 10,
    wasteCost: 0,
    shrinkageCost: 0,
    wasCounted: false,
    ...overrides,
  }
}

function report(
  overrides: Partial<DailyInventoryReportForDay> = {},
): DailyInventoryReportForDay {
  return {
    dayKey: '2026-07-29',
    rows: [row()],
    totals: { cogs: 10, wasteCost: 0, shrinkageCost: 0 },
    countedCount: 0,
    uncountedCount: 1,
    uncostedCount: 0,
    ...overrides,
  }
}

function renderPanel(overrides: Partial<DailyInventoryReportForDay> = {}) {
  return render(
    <DailyReportPanel
      tenantSlug="acme"
      report={report(overrides)}
      latestDayKey="2026-07-30"
    />,
  )
}

describe('DailyReportPanel', () => {
  test('names the day being reported', () => {
    renderPanel()

    expect(screen.getByText('Wed, 29 Jul 2026')).toBeInTheDocument()
  })

  test('shows what each ingredient used and what it cost', () => {
    renderPanel()

    const line = screen.getByTestId('daily-report-row-flour')
    expect(within(line).getByText('Flour')).toBeInTheDocument()
    expect(within(line).getByText('200 g')).toBeInTheDocument()
    expect(within(line).getByText('₱10.00')).toBeInTheDocument()
  })

  test('totals the day in money, which is the question being asked', () => {
    renderPanel({
      rows: [row({ cogs: 120, wasteCost: 30, shrinkageCost: 45 })],
      totals: { cogs: 120, wasteCost: 30, shrinkageCost: 45 },
    })

    expect(screen.getByTestId('daily-report-total-cogs')).toHaveTextContent('₱120.00')
    expect(screen.getByTestId('daily-report-total-waste')).toHaveTextContent('₱30.00')
    expect(screen.getByTestId('daily-report-total-shrinkage')).toHaveTextContent('₱45.00')
  })

  test('keeps the order it was given, which is worst-first by peso', () => {
    // Re-sorting here would silently override the ranking the core computed and
    // bury the expensive loss below a cheap one.
    renderPanel({
      rows: [
        row({ inventoryItemId: 'beef', name: 'Beef', shrinkageCost: 900 }),
        row({ inventoryItemId: 'salt', name: 'Salt', shrinkageCost: 2 }),
      ],
    })

    const names = screen.getAllByTestId(/^daily-report-row-/).map((el) => el.dataset.itemName)
    expect(names).toEqual(['Beef', 'Salt'])
  })

  test('says out loud that nobody counted, so a clean day is not mistaken for a checked one', () => {
    renderPanel({ uncountedCount: 3, countedCount: 0 })

    expect(
      screen.getByText(
        '3 ingredients moved today but were never counted, so their shrinkage is unknown.',
      ),
    ).toBeInTheDocument()
  })

  test('says out loud when an ingredient has no price, so a low cost is not read as a cheap day', () => {
    renderPanel({ uncostedCount: 2 })

    expect(
      screen.getByText(
        '2 ingredients have no cost set, so their money is missing from these totals.',
      ),
    ).toBeInTheDocument()
  })

  test('marks the ingredients that were actually counted', () => {
    renderPanel({
      rows: [row({ wasCounted: true, shrinkage: 50, shrinkageCost: 2.5 })],
      countedCount: 1,
      uncountedCount: 0,
    })

    const line = screen.getByTestId('daily-report-row-flour')
    expect(within(line).getByText('Counted')).toBeInTheDocument()
  })

  test('reads a day with no movement as nothing happening, not as an empty table', () => {
    // A blank table looks like a broken screen. It has to say the shop was quiet.
    renderPanel({ rows: [], totals: { cogs: 0, wasteCost: 0, shrinkageCost: 0 }, uncountedCount: 0 })

    expect(screen.getByText(/no stock moved/i)).toBeInTheDocument()
  })

  test('links to the previous day, keeping the tab so the merchant does not land back on Overview', () => {
    renderPanel()

    expect(screen.getByRole('link', { name: /previous day/i })).toHaveAttribute(
      'href',
      '/acme/admin/inventory?tab=reports&day=2026-07-28',
    )
  })

  test('links to the next day when a later one exists', () => {
    renderPanel()

    expect(screen.getByRole('link', { name: /next day/i })).toHaveAttribute(
      'href',
      '/acme/admin/inventory?tab=reports&day=2026-07-30',
    )
  })

  test('offers no next day once the report has caught up to the latest', () => {
    // Linking into the future would show an empty report that reads as a lost day.
    render(
      <DailyReportPanel
        tenantSlug="acme"
        report={report({ dayKey: '2026-07-30' })}
        latestDayKey="2026-07-30"
      />,
    )

    expect(screen.queryByRole('link', { name: /next day/i })).not.toBeInTheDocument()
  })
})

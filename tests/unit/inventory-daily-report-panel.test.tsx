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
    transferred: 0,
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
    // Null, not an abandoned count: the default fixture is a day nobody opened
    // a session for, which is what every day before sessions looks like.
    countSession: null,
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

/**
 * Branch transfers, on the row.
 *
 * Accounting for a transfer in the arithmetic is only half the fix. The table
 * shows opening, in, used, waste, missing and closing — a day with a transfer
 * still reads as figures that do not add up unless the transfer is named, and
 * an unexplained gap on a stock report invites exactly the wrong conclusion.
 *
 * Shown only when it happened: a permanent column of zeros would cost every
 * single-branch tenant a column to describe something that never occurs.
 */
describe('DailyReportPanel — branch transfers', () => {
  it('names stock that left for another branch', () => {
    renderPanel({ rows: [row({ transferred: -200, closing: 600 })] })

    expect(screen.getByTestId('daily-report-transfer-flour')).toHaveTextContent(/200/)
    expect(screen.getByTestId('daily-report-transfer-flour')).toHaveTextContent(/out|sent/i)
  })

  it('names stock that arrived from another branch', () => {
    renderPanel({ rows: [row({ transferred: 300, closing: 1100 })] })

    expect(screen.getByTestId('daily-report-transfer-flour')).toHaveTextContent(/300/)
    expect(screen.getByTestId('daily-report-transfer-flour')).toHaveTextContent(/in|received/i)
  })

  it('says nothing on a day with no transfers', () => {
    // Which is every day, for every single-branch tenant.
    renderPanel({ rows: [row({ transferred: 0 })] })

    expect(screen.queryByTestId('daily-report-transfer-flour')).not.toBeInTheDocument()
  })
})

/**
 * A count that stopped early is the reason the rows below it are unexplained,
 * so the merchant has to be told before they start blaming the shelf.
 */
describe('DailyReportPanel — an unfinished count', () => {
  it('names how far the count got, above the uncounted ingredients', () => {
    renderPanel({
      countSession: {
        state: 'partial',
        countedCount: 4,
        expectedCount: 40,
        coveragePercent: 10,
        isShelfAccountedFor: false,
      },
    })

    const caveats = screen.getByTestId('daily-report-caveats')
    expect(caveats).toHaveTextContent(/4 of 40/)
  })

  it('says nothing extra when the count was complete', () => {
    // A caveat that shows up on a good day is noise, and noise is how the
    // caveats that matter stop being read.
    renderPanel({
      uncountedCount: 0,
      countSession: {
        state: 'complete',
        countedCount: 40,
        expectedCount: 40,
        coveragePercent: 100,
        isShelfAccountedFor: true,
      },
    })

    expect(screen.queryByTestId('daily-report-caveats')).not.toBeInTheDocument()
  })
})

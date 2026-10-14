/**
 * Phase 0d — the takings on the daily report need `reports` (plan §6.3).
 *
 * The report itself is priced and only reaches an account with `costs`. The
 * Sales tile and food cost % divide by the day's takings, which belong to
 * Sales Reports. An account without it must not see them — and must be told
 * why, rather than shown a report that silently lost two cards.
 *
 * "Withheld" is a FOURTH state beside the three the panel already keeps apart:
 * a number, `null` (could not be read), and absent (this caller does not deal
 * in revenue). It must not read as either of the last two.
 */

import { render, screen } from '@testing-library/react'
import { DailyReportPanel } from '@/components/admin/daily-report-panel'
import type { DailyInventoryReportForDay } from '@/lib/inventory/daily-report-read'

const NOTE = 'Sales and food cost % need Sales Reports access. Ask the owner.'

function report(): DailyInventoryReportForDay {
  return {
    dayKey: '2026-07-29',
    rows: [],
    totals: { cogs: 300, wasteCost: 0, shrinkageCost: 0 },
    countedCount: 0,
    uncountedCount: 0,
    uncostedCount: 0,
    countSession: null,
  }
}

function renderPanel(props: { revenue?: number | null; isSalesWithheld?: boolean } = {}) {
  return render(
    <DailyReportPanel tenantSlug="acme" report={report()} latestDayKey="2026-07-30" {...props} />,
  )
}

describe('DailyReportPanel — sales figures need Sales Reports', () => {
  test('hides the Sales and food cost tiles from an account without reports', () => {
    renderPanel({ isSalesWithheld: true })

    expect(screen.queryByTestId('daily-report-total-revenue')).not.toBeInTheDocument()
    expect(screen.queryByTestId('daily-report-food-cost')).not.toBeInTheDocument()
  })

  test('says why the sales figures are missing', () => {
    renderPanel({ isSalesWithheld: true })

    expect(screen.getByText(NOTE)).toBeInTheDocument()
  })

  test('never claims the takings could not be read when they were withheld', () => {
    renderPanel({ isSalesWithheld: true })

    expect(screen.queryByText(/could not be read/)).not.toBeInTheDocument()
  })

  test('still shows the stock costs the account may see', () => {
    renderPanel({ isSalesWithheld: true })

    expect(screen.getByTestId('daily-report-total-cogs')).toHaveTextContent('₱300.00')
  })

  test('withholds the tiles even if a figure was passed by mistake', () => {
    renderPanel({ isSalesWithheld: true, revenue: 1000 })

    expect(screen.queryByText('₱1,000.00')).not.toBeInTheDocument()
  })

  test('shows no note to an account that may see sales', () => {
    renderPanel({ revenue: 1000 })

    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
    expect(screen.getByTestId('daily-report-total-revenue')).toHaveTextContent('₱1,000.00')
  })
})

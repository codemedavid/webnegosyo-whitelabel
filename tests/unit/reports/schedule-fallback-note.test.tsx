/**
 * When the business-day schedule could not be read, report pages say days are
 * midnight to midnight (cashier plan §2.3) — quietly, above the figures — and
 * say nothing when it loaded.
 */
import { render, screen } from '@testing-library/react'
import { ReportNotices } from '@/components/admin/reports/sales/report-page-chrome'
import type { ReportContext } from '@/lib/reports/read/report-context'
import { SCHEDULE_FALLBACK_NOTE } from '@/lib/reports/schedule-fallback-note'

function context(overrides: Partial<ReportContext>): ReportContext {
  return { periodError: null, isMixedBackend: false, isScheduleFallback: false, period: { label: 'This week' }, ...overrides } as ReportContext
}

describe('ReportNotices and the business-day fallback', () => {
  it('shows the midnight note when the schedule fell back', () => {
    render(<ReportNotices context={context({ isScheduleFallback: true })} />)

    expect(screen.getByRole('note')).toHaveTextContent(SCHEDULE_FALLBACK_NOTE)
  })

  it('shows nothing when the schedule loaded', () => {
    const { container } = render(<ReportNotices context={context({})} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('reads the agreed sentence', () => {
    expect(SCHEDULE_FALLBACK_NOTE).toBe('Showing midnight to midnight; couldn’t load your business day setting.')
  })
})

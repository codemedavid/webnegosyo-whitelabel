import { render, screen, within } from '@testing-library/react'
import { GovBreakdown, GovOverview } from '@/components/admin/gov-discounts/gov-overview'
import { GovEmptyState } from '@/components/admin/gov-discounts/gov-empty-state'
import { GovExportsCard } from '@/components/admin/gov-discounts/gov-exports-card'
import { GovPeriodPicker } from '@/components/admin/gov-discounts/gov-period-picker'
import { resolveReportPeriod } from '@/lib/gov-discount-reports/period'
import { sumClaims } from '@/lib/gov-discount-reports/netting'
import { claim, reversalOf } from '../../fixtures/gov-discount-claims'

const TENANT = '11111111-1111-4111-8111-111111111111'
const NOW = Date.parse('2026-10-12T02:00:00.000Z')
const OCTOBER = resolveReportPeriod({ period: 'month' }, NOW)

describe('GovOverview', () => {
  it('shows the five net figures and says reversals are already subtracted', () => {
    const cancelled = claim()
    render(<GovOverview totals={sumClaims([claim(), cancelled, reversalOf(cancelled)])} reversedCount={1} periodLabel="October 2026" />)
    expect(within(screen.getByTestId('gov-stat-sales')).getByText('1')).toBeInTheDocument()
    expect(screen.getByTestId('gov-stat-sales')).toHaveTextContent('1 taken back')
    expect(screen.getByTestId('gov-stat-reduction')).toHaveTextContent('₱32.00')
    expect(screen.getByTestId('gov-stat-vat')).toHaveTextContent('₱12.00')
  })
})

describe('GovBreakdown', () => {
  it('lists each group with its figures, or says the period is empty', () => {
    const { rerender } = render(
      <GovBreakdown
        testId="by-cashier"
        title="By cashier"
        description="Who gave them"
        groups={[{ key: 'Ana', label: 'Ana', totals: sumClaims([claim(), claim()]) }]}
      />,
    )
    expect(screen.getByRole('region', { name: 'By cashier' })).toHaveTextContent('Ana')
    expect(screen.getByText(/2 sales/)).toBeInTheDocument()

    rerender(<GovBreakdown testId="by-cashier" title="By cashier" description="Who gave them" groups={[]} />)
    expect(screen.getByText('Nothing in this period.')).toBeInTheDocument()
  })
})

describe('GovExportsCard', () => {
  it('links every book through the export route with the period, and explains the files', () => {
    render(<GovExportsCard tenantId={TENANT} period={OCTOBER} kinds={['senior', 'athlete']} isTruncated={false} />)
    const senior = screen.getByRole('link', { name: /Senior Citizen sales book/ })
    expect(senior.getAttribute('href')).toBe(`/api/gov-discounts/export?tenantId=${TENANT}&book=senior&period=month`)
    expect(screen.getByRole('link', { name: /PWD sales book/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /National Athlete/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Medal of Valor/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Daily summary/ })).toBeInTheDocument()
    expect(screen.getByText(/not a BIR-accredited POS/)).toBeInTheDocument()
  })

  it('offers no download when the period is too big for one file', () => {
    render(<GovExportsCard tenantId={TENANT} period={OCTOBER} kinds={[]} isTruncated />)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByText(/too many records/)).toBeInTheDocument()
  })
})

describe('GovEmptyState', () => {
  it('explains what will appear and links to Tax & discounts settings', () => {
    render(<GovEmptyState tenantSlug="kape" />)
    expect(screen.getByRole('link', { name: 'Set up Tax & discounts' })).toHaveAttribute('href', '/kape/admin/settings/tax')
    expect(screen.getByText(/sales books your accountant needs/)).toBeInTheDocument()
  })
})

describe('GovPeriodPicker', () => {
  it('marks the current preset and pre-fills the custom range', () => {
    render(<GovPeriodPicker basePath="/kape/admin/gov-discounts" period={OCTOBER} />)
    expect(screen.getByRole('link', { name: 'This month' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Last month' })).toHaveAttribute('href', '/kape/admin/gov-discounts?period=last_month')
    expect(screen.getByLabelText('From')).toHaveValue('2026-10-01')
    expect(screen.getByLabelText('To')).toHaveValue('2026-10-31')
  })
})

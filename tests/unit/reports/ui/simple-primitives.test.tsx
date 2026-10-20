import { render, screen, within } from '@testing-library/react'
import { BarCell, barFraction } from '@/components/admin/reports/bar-cell'
import { CoverageNote } from '@/components/admin/reports/coverage-note'
import { InsightCard } from '@/components/admin/reports/insight-card'
import { KpiTile } from '@/components/admin/reports/kpi-tile'
import { ReportSection } from '@/components/admin/reports/report-section'
import { ChartSkeleton, KpiRowSkeleton, TableSkeleton } from '@/components/admin/reports/report-skeletons'
import { ShareBar, sharePercents } from '@/components/admin/reports/share-bar'

describe('KpiTile', () => {
  it('formats centavos as whole pesos', () => {
    render(<KpiTile label="Net sales" valueCents={1_234_567} />)
    expect(screen.getByText('₱12,346')).toBeInTheDocument()
    expect(screen.getByText('Net sales')).toBeInTheDocument()
  })

  it('renders "—" for an unknown value, never ₱0', () => {
    const { rerender } = render(<KpiTile label="Net sales" valueCents={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    rerender(<KpiTile label="Orders" value={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('dims stale figures but keeps them visible', () => {
    const { container } = render(<KpiTile label="Orders" value="128" isStale hint="vs 120" />)
    const tile = container.firstElementChild as HTMLElement
    expect(tile).toHaveClass('opacity-60')
    expect(tile).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('128')).toBeInTheDocument()
    expect(screen.getByText('vs 120')).toBeInTheDocument()
  })
})

describe('InsightCard and CoverageNote', () => {
  it('renders the headline, detail and action', () => {
    render(<InsightCard headline="Sales were up 12%." detail="Friday led." action={<button type="button">See items</button>} />)
    expect(screen.getByRole('region', { name: 'In short' })).toHaveTextContent('Sales were up 12%.Friday led.')
    expect(screen.getByRole('button', { name: 'See items' })).toBeInTheDocument()
  })

  it('coverage notes are notes with their tone', () => {
    render(<CoverageNote tone="warning">Profit counts 41 of 58 dishes.</CoverageNote>)
    expect(screen.getByRole('note')).toHaveAttribute('data-tone', 'warning')
    expect(screen.getByRole('note')).toHaveTextContent('Profit counts 41 of 58 dishes.')
  })
})

describe('BarCell', () => {
  it('scales the bar against the max and keeps the number as text', () => {
    render(<BarCell value={25} max={100} label="₱2,500" />)
    expect(screen.getByText('₱2,500')).toBeInTheDocument()
    expect(screen.getByTestId('bar-cell-fill')).toHaveStyle({ width: '25.0%' })
    expect(screen.getByTestId('bar-cell-fill').parentElement).toHaveAttribute('aria-hidden', 'true')
  })

  it('clamps odd inputs', () => {
    expect(barFraction(-5, 100)).toBe(0)
    expect(barFraction(5, 0)).toBe(0)
    expect(barFraction(150, 100)).toBe(1)
  })
})

describe('ShareBar', () => {
  it('sharePercents always adds to 100', () => {
    expect(sharePercents([1, 1, 1])).toEqual([34, 33, 33])
    expect(sharePercents([0, 0])).toEqual([0, 0])
    const percents = sharePercents([123_456, 98_765, 4_321, 77])
    expect(percents.reduce((sum, value) => sum + value, 0)).toBe(100)
  })

  it('lists label · amount · % with Unpaid labelled and hatched', () => {
    render(
      <ShareBar
        label="How customers paid"
        parts={[
          { key: 'cash', label: 'Cash', cents: 600_000 },
          { key: 'gcash', label: 'GCash', cents: 300_000 },
        ]}
        unpaidCents={100_000}
      />,
    )
    const legend = screen.getByRole('list', { name: 'How customers paid' })
    const items = within(legend).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Cash₱6,00060%')
    expect(items[2]).toHaveTextContent('Unpaid₱1,00010%')
    expect(items[2]).toHaveAttribute('data-unpaid', 'true')
    const total = items.reduce((sum, item) => sum + Number(item.textContent?.match(/(\d+)%$/)?.[1]), 0)
    expect(total).toBe(100)
    expect(screen.getByTestId('share-segment-__unpaid').style.background).toContain('repeating-linear-gradient')
  })

  it('says so when there is nothing to split', () => {
    render(<ShareBar parts={[]} />)
    expect(screen.getByText('No payments in this period.')).toBeInTheDocument()
  })
})

describe('ReportSection', () => {
  it('labels the section by its title and scopes errors to the card', () => {
    render(
      <ReportSection title="Trend" description="By day" isError>
        <p>chart</p>
      </ReportSection>,
    )
    const section = screen.getByRole('region', { name: 'Trend' })
    expect(within(section).getByTestId('report-section-error')).toBeInTheDocument()
    expect(within(section).queryByText('chart')).not.toBeInTheDocument()
  })
})

describe('skeletons', () => {
  it('announce loading without exposing the shapes', () => {
    render(
      <>
        <KpiRowSkeleton />
        <ChartSkeleton />
        <TableSkeleton rows={3} />
      </>,
    )
    expect(screen.getAllByRole('status')).toHaveLength(3)
    expect(screen.getByText('Loading figures')).toBeInTheDocument()
  })
})

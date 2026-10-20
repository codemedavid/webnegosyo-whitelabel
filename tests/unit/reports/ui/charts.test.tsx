/**
 * TrendChart + HourHeatmap. Recharts' ResponsiveContainer measures nothing in
 * jsdom, so it is swapped for a fixed-size wrapper. jest.mock is NOT hoisted
 * under next/jest's SWC transform, so the components are imported lazily.
 */
import { cloneElement, isValidElement, type ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installDomPolyfills } from './dom-polyfills'

jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div style={{ width: 600, height: 240 }}>
        {isValidElement(children) ? cloneElement(children as React.ReactElement<{ width: number; height: number }>, { width: 600, height: 240 }) : children}
      </div>
    ),
  }
})

installDomPolyfills()

const buckets = [
  { key: 'mon', label: 'Mon', currentCents: 1_250_000, previousCents: 1_000_000 },
  { key: 'tue', label: 'Tue', currentCents: 980_000, previousCents: null },
]

describe('TrendChart', () => {
  it('hides the chart from screen readers and reads the summary sentence instead', async () => {
    const { TrendChart } = await import('@/components/admin/reports/trend-chart')
    render(
      <TrendChart
        buckets={buckets}
        seriesLabel="Net sales"
        compareLabel="Last week"
        summary="Net sales peaked on Monday at ₱12,500."
      />,
    )
    expect(screen.getByText('Net sales peaked on Monday at ₱12,500.')).toHaveClass('sr-only')
    expect(screen.getByTestId('trend-chart-canvas')).toHaveAttribute('aria-hidden', 'true')
  })

  it('swaps to a table with the same numbers and back', async () => {
    const user = userEvent.setup()
    const { TrendChart } = await import('@/components/admin/reports/trend-chart')
    render(<TrendChart buckets={buckets} seriesLabel="Net sales" compareLabel="Last week" summary="s" />)

    await user.click(screen.getByRole('button', { name: /show as table/i }))
    const table = screen.getByRole('table', { name: 'Net sales by period' })
    const monday = within(table).getByRole('rowheader', { name: 'Mon' }).closest('tr') as HTMLElement
    expect(monday).toHaveTextContent('₱12,500')
    expect(monday).toHaveTextContent('₱10,000')
    const tuesday = within(table).getByRole('rowheader', { name: 'Tue' }).closest('tr') as HTMLElement
    expect(tuesday).toHaveTextContent('₱9,800')
    expect(tuesday).toHaveTextContent('—')
    expect(within(table).getByRole('columnheader', { name: 'Last week' })).toBeInTheDocument()
    expect(screen.queryByTestId('trend-chart-canvas')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /show as chart/i }))
    expect(screen.getByTestId('trend-chart-canvas')).toBeInTheDocument()
  })

  it('drops the comparison column when there is no comparison data', async () => {
    const user = userEvent.setup()
    const { TrendChart } = await import('@/components/admin/reports/trend-chart')
    render(
      <TrendChart
        buckets={buckets.map((bucket) => ({ ...bucket, previousCents: null }))}
        seriesLabel="Net sales"
        compareLabel="Last week"
        summary="s"
      />,
    )
    await user.click(screen.getByRole('button', { name: /show as table/i }))
    expect(screen.queryByRole('columnheader', { name: 'Last week' })).not.toBeInTheDocument()
  })
})

describe('HourHeatmap', () => {
  const cells = [
    { weekday: 6, hour: 19, orders: 42, netCents: 1_230_000 },
    { weekday: 1, hour: 8, orders: 1, netCents: 15_000 },
  ]

  it('labels every one of the 168 cells, including empty ones', async () => {
    const { HourHeatmap } = await import('@/components/admin/reports/hour-heatmap')
    render(<HourHeatmap cells={cells} metric="orders" />)
    const grid = screen.getByRole('group', { name: /orders by day and hour/i })
    expect(within(grid).getAllByRole('img')).toHaveLength(168)
    expect(screen.getByRole('img', { name: 'Saturday 7 PM: 42 orders, ₱12,300' })).toHaveAttribute('data-step', '5')
    expect(screen.getByRole('img', { name: 'Monday 8 AM: 1 order, ₱150' })).toHaveAttribute('data-step', '1')
    expect(screen.getByRole('img', { name: 'Sunday 12 AM: 0 orders, ₱0' })).toHaveAttribute('data-step', '0')
  })

  it('shades by net sales when asked', async () => {
    const { HourHeatmap } = await import('@/components/admin/reports/hour-heatmap')
    render(<HourHeatmap cells={cells} metric="net" />)
    expect(screen.getByRole('group', { name: /net sales by day and hour/i })).toBeInTheDocument()
    expect(screen.getByText('Fewer net sales')).toBeInTheDocument()
  })

  it('has the same table toggle, listing only hours with orders', async () => {
    const user = userEvent.setup()
    const { HourHeatmap } = await import('@/components/admin/reports/hour-heatmap')
    render(<HourHeatmap cells={cells} metric="orders" summary="Busiest: Saturday 7 PM." />)
    expect(screen.getByText('Busiest: Saturday 7 PM.')).toHaveClass('sr-only')
    await user.click(screen.getByRole('button', { name: /show as table/i }))
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('rowheader')
    expect(rows.map((row) => row.textContent)).toEqual(['Monday 8 AM', 'Saturday 7 PM'])
    expect(within(table).getByRole('rowheader', { name: 'Saturday 7 PM' }).closest('tr')).toHaveTextContent('42₱12,300')
  })
})

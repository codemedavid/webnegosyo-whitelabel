import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MetricInfo } from '@/components/admin/reports/metric-info'

describe('MetricInfo', () => {
  it('opens on click, moves focus into the panel, and Escape closes it returning focus', async () => {
    const user = userEvent.setup()
    render(<MetricInfo term="Net sales" definition="What you kept after discounts." formula="Gross − discounts" />)
    const button = screen.getByRole('button', { name: 'About Net sales' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(button)
    const panel = screen.getByRole('dialog', { name: 'Net sales' })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(panel).toHaveTextContent('What you kept after discounts.')
    expect(panel).toHaveTextContent('Formula: Gross − discounts')
    expect(panel).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveFocus()
  })

  it('toggles closed on a second click and closes on an outside tap', async () => {
    const user = userEvent.setup()
    render(
      <>
        <MetricInfo term="Orders" definition="Closed orders." />
        <p>elsewhere</p>
      </>,
    )
    const button = screen.getByRole('button', { name: 'About Orders' })
    await user.click(button)
    await user.click(button)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(button)
    await user.click(screen.getByText('elsewhere'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

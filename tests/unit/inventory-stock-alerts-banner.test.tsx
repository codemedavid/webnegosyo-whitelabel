/**
 * Phase 5B follow-up — the surface a merchant actually sees.
 *
 * Until this existed, alerts were written and read but never shown. The banner
 * sits at the top of the inventory page and is the whole point of the feature:
 * it has to disappear completely when there is nothing wrong, and be
 * impossible to miss when there is.
 */

import { render, screen } from '@testing-library/react'
import { StockAlertsBanner } from '@/components/admin/stock-alerts-banner'
import type { StockAlertView } from '@/lib/inventory/stock-alerts-view'

function alert(overrides: Partial<StockAlertView> = {}): StockAlertView {
  return {
    id: 'a1',
    inventoryItemId: 'flour',
    name: 'Flour',
    level: 'low',
    quantity: 5,
    reorderLevel: 20,
    unitAbbreviation: 'kg',
    createdAt: '2026-07-27T10:00:00.000Z',
    ...overrides,
  }
}

describe('StockAlertsBanner', () => {
  it('renders nothing at all when there are no open alerts', () => {
    // A quiet day must not cost a merchant any screen space.
    const { container } = render(<StockAlertsBanner alerts={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('leads with a headline counting what is wrong', () => {
    render(
      <StockAlertsBanner
        alerts={[alert({ id: 'a', level: 'out' }), alert({ id: 'b', level: 'low' })]}
      />,
    )

    expect(screen.getByText('1 ingredient out of stock, 1 running low')).toBeInTheDocument()
  })

  it('names every ingredient that needs attention', () => {
    render(
      <StockAlertsBanner
        alerts={[
          alert({ id: 'a', name: 'Flour', level: 'low', quantity: 5, reorderLevel: 20 }),
          alert({ id: 'b', name: 'Sugar', level: 'out', quantity: 0 }),
        ]}
      />,
    )

    expect(screen.getByText('Flour is down to 5 kg (reorder at 20 kg)')).toBeInTheDocument()
    expect(screen.getByText('Sugar is out of stock')).toBeInTheDocument()
  })

  it('lists exhausted ingredients before merely-low ones', () => {
    render(
      <StockAlertsBanner
        alerts={[
          alert({ id: 'low-1', name: 'Flour', level: 'low' }),
          alert({ id: 'out-1', name: 'Sugar', level: 'out' }),
        ]}
      />,
    )

    const rendered = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(rendered[0]).toContain('Sugar')
    expect(rendered[1]).toContain('Flour')
  })

  it('announces itself to assistive technology without stealing focus', () => {
    // A merchant mid-service should hear about an outage, not be interrupted.
    render(<StockAlertsBanner alerts={[alert({ level: 'out' })]} />)

    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

/**
 * The owner's cross-branch stock panel.
 *
 * `summarizeBranchStock` proved the arithmetic; this is the surface that shows
 * it. The rule that matters most is the quiet one: a single-shop store must see
 * nothing at all, or every ingredient row grows a panel that says the same
 * useless thing for the majority of tenants.
 */

import { render, screen } from '@testing-library/react'
import { BranchStockPanel } from '@/components/admin/branch-stock-panel'
import type { BranchStockSummary } from '@/lib/inventory/branch-stock-summary'

const summary = (overrides: Partial<BranchStockSummary> = {}): BranchStockSummary => ({
  isMultiBranch: true,
  lines: [
    { outletId: 'o-north', name: 'North', quantity: 500 },
    { outletId: 'o-south', name: 'South', quantity: 200 },
  ],
  total: 700,
  emptyBranches: [],
  suggestion: null,
  ...overrides,
})

describe('BranchStockPanel', () => {
  it('renders nothing for a single-shop store', () => {
    const { container } = render(
      <BranchStockPanel summary={summary({ isMultiBranch: false, lines: [] })} unitLabel="g" />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('shows what each branch is holding', () => {
    render(<BranchStockPanel summary={summary()} unitLabel="g" />)

    expect(screen.getByText('North')).toBeInTheDocument()
    expect(screen.getByText(/500\s*g/)).toBeInTheDocument()
    expect(screen.getByText('South')).toBeInTheDocument()
    expect(screen.getByText(/200\s*g/)).toBeInTheDocument()
  })

  it('calls out a branch that has run out', () => {
    render(
      <BranchStockPanel
        summary={summary({
          lines: [
            { outletId: 'o-north', name: 'North', quantity: 700 },
            { outletId: 'o-south', name: 'South', quantity: 0 },
          ],
          emptyBranches: [{ outletId: 'o-south', name: 'South', quantity: 0 }],
        })}
        unitLabel="g"
      />,
    )

    expect(screen.getByText(/out of stock/i)).toBeInTheDocument()
  })

  it('names the transfer direction when one is obvious', () => {
    render(
      <BranchStockPanel
        summary={summary({
          emptyBranches: [{ outletId: 'o-south', name: 'South', quantity: 0 }],
          suggestion: {
            fromOutletId: 'o-north',
            fromName: 'North',
            toOutletId: 'o-south',
            toName: 'South',
          },
        })}
        unitLabel="g"
      />,
    )

    // Direction, not a quantity — the merchant decides how much they can carry.
    expect(screen.getByText(/North\s*→\s*South/)).toBeInTheDocument()
  })

  it('suggests nothing when every branch has stock', () => {
    render(<BranchStockPanel summary={summary()} unitLabel="g" />)

    expect(screen.queryByText(/→/)).not.toBeInTheDocument()
    expect(screen.queryByText(/out of stock/i)).not.toBeInTheDocument()
  })
})

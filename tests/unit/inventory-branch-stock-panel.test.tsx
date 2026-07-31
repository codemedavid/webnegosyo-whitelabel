/**
 * The owner's cross-branch panel, and the one thing it could not do.
 *
 * The panel names a direction — North → South — because that is the decision an
 * owner makes standing in front of it. Until now it named the direction and
 * stopped: the screen that performs a transfer existed, and nothing on the
 * screen where the need is discovered pointed at it. The merchant had to know
 * the feature was there, leave, and find it in the sidebar.
 */

import { render, screen } from '@testing-library/react'
import { BranchStockPanel } from '@/components/admin/branch-stock-panel'
import type { BranchStockSummary } from '@/lib/inventory/branch-stock-summary'

const summary = (over: Partial<BranchStockSummary> = {}): BranchStockSummary =>
  ({
    isMultiBranch: true,
    lines: [
      { outletId: 'o-north', name: 'North', quantity: 700 },
      { outletId: 'o-south', name: 'South', quantity: 0 },
    ],
    emptyBranches: [{ outletId: 'o-south', name: 'South' }],
    suggestion: { fromOutletId: 'o-north', fromName: 'North', toOutletId: 'o-south', toName: 'South' },
    ...over,
  }) as BranchStockSummary

describe('BranchStockPanel — acting on the direction it names', () => {
  it('links to the transfers screen when it is suggesting a move', () => {
    render(<BranchStockPanel summary={summary()} unitLabel="g" transfersHref="/demo/admin/inventory/transfers" />)

    expect(screen.getByRole('link', { name: /transfer/i })).toHaveAttribute(
      'href',
      '/demo/admin/inventory/transfers',
    )
  })

  it('offers no link when there is nothing to move', () => {
    // Every branch is out: that is a purchasing problem, and a transfer link
    // would send the owner to a screen that cannot help them.
    render(
      <BranchStockPanel
        summary={summary({ suggestion: undefined })}
        unitLabel="g"
        transfersHref="/demo/admin/inventory/transfers"
      />,
    )

    expect(screen.queryByRole('link', { name: /transfer/i })).not.toBeInTheDocument()
  })

  it('still names the direction when no link was given', () => {
    // The prop is optional so a caller that has no slug to hand still renders a
    // working panel rather than crashing or losing the suggestion.
    render(<BranchStockPanel summary={summary()} unitLabel="g" />)

    expect(screen.getByText(/North → South/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders nothing at all for a single-shop store', () => {
    const { container } = render(
      <BranchStockPanel
        summary={summary({ isMultiBranch: false })}
        unitLabel="g"
        transfersHref="/demo/admin/inventory/transfers"
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})

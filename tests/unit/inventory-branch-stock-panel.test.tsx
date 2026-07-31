/**
 * The owner's cross-branch panel, and the one thing it could not do.
 *
 * The panel names a direction — North → South — because that is the decision an
 * owner makes standing in front of it. Until now it named the direction and
 * stopped: the screen that performs a transfer existed, and nothing on the
 * screen where the need is discovered pointed at it. The merchant had to know
 * the feature was there, leave, and find it in the sidebar.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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

describe('BranchStockPanel — a branch\'s own reorder level', () => {
  const withPars = () =>
    summary({
      lines: [
        { outletId: 'o-north', name: 'North', quantity: 700, reorderLevel: 50 },
        { outletId: 'o-south', name: 'South', quantity: 0, reorderLevel: 0 },
      ],
    } as Partial<BranchStockSummary>)

  it("shows a branch's own threshold once it has one", async () => {
    render(<BranchStockPanel summary={withPars()} unitLabel="g" storeReorderLevel={20} />)

    const north = screen.getByRole('spinbutton', { name: /north.*reorder/i })
    expect(north).toHaveValue(50)
  })

  it('shows a branch with no threshold as inheriting the store level', async () => {
    // The distinction the merchant needs: South is not "warned at 0", it is
    // warned at the store's 20 until someone says otherwise. Rendering a bare
    // zero would read as "never warn me".
    render(<BranchStockPanel summary={withPars()} unitLabel="g" storeReorderLevel={20} />)

    expect(screen.getByText(/store level.*20/i)).toBeInTheDocument()
  })

  it('saves the branch threshold the merchant typed', async () => {
    const onSetReorderLevel = jest.fn()
    const user = userEvent.setup()
    render(
      <BranchStockPanel
        summary={withPars()}
        unitLabel="g"
        storeReorderLevel={20}
        onSetReorderLevel={onSetReorderLevel}
      />,
    )

    const south = screen.getByRole('spinbutton', { name: /south.*reorder/i })
    await user.clear(south)
    await user.type(south, '5')
    await user.click(screen.getByRole('button', { name: /save.*south/i }))

    expect(onSetReorderLevel).toHaveBeenCalledWith('o-south', 5)
  })

  it('offers no editing when the caller cannot save', async () => {
    // The panel is also rendered read-only. Showing an input that silently
    // does nothing is worse than showing the number.
    render(<BranchStockPanel summary={withPars()} unitLabel="g" storeReorderLevel={20} />)

    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
  })
})

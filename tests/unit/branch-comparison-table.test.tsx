import { render, screen } from '@testing-library/react'
import { BranchComparisonTable } from '@/components/admin/branch-comparison-table'
import type { AnalyticsOrderLike } from '@/lib/outlets/branch-analytics'

/**
 * The owner-facing comparison.
 *
 * The component derives its rows from an order list rather than accepting
 * pre-computed figures, so the table and any total shown beside it cannot
 * disagree about which orders were counted.
 *
 * The empty and single-branch states matter as much as the populated one: a
 * store that has just switched multi-branch on has no attributed orders yet,
 * and a table of zeroes with no explanation reads as broken.
 */

function order(overrides: Partial<AnalyticsOrderLike> & Record<string, unknown> = {}) {
  return {
    total: 100,
    status: 'completed',
    ...overrides,
  } as AnalyticsOrderLike
}

function branchOrder(id: string, name: string, total: number) {
  return order({
    outlet_id: id,
    customer_data: { outlet_id: id, outlet_name: name },
    total,
  })
}

describe('BranchComparisonTable', () => {
  it('lists every branch that took an order', () => {
    render(
      <BranchComparisonTable
        orders={[branchOrder('north', 'North Branch', 400), branchOrder('south', 'South', 100)]}
      />
    )

    expect(screen.getByText('North Branch')).toBeInTheDocument()
    expect(screen.getByText('South')).toBeInTheDocument()
  })

  it('shows the order count for a branch', () => {
    render(
      <BranchComparisonTable
        orders={[branchOrder('north', 'North Branch', 400), branchOrder('north', 'North Branch', 200)]}
      />
    )

    expect(screen.getByTestId('branch-orders-north')).toHaveTextContent('2')
  })

  it('names the Unassigned bucket so the gap is visible', () => {
    render(<BranchComparisonTable orders={[branchOrder('north', 'North Branch', 400), order()]} />)

    // Targeted by row rather than by text: the word also appears in the note
    // below the table that explains what the bucket holds.
    expect(screen.getByTestId('branch-name-unassigned')).toHaveTextContent('Unassigned')
  })

  it('explains what Unassigned means rather than leaving the owner guessing', () => {
    render(<BranchComparisonTable orders={[order()]} />)

    expect(screen.getByTestId('unassigned-note')).toBeInTheDocument()
  })

  it('says nothing about Unassigned when every order carries a branch', () => {
    render(<BranchComparisonTable orders={[branchOrder('north', 'North Branch', 400)]} />)

    expect(screen.queryByTestId('unassigned-note')).not.toBeInTheDocument()
  })

  it('explains the empty state instead of rendering a bare table', () => {
    render(<BranchComparisonTable orders={[]} />)

    expect(screen.getByTestId('branch-comparison-empty')).toBeInTheDocument()
  })

  it('ranks the highest-earning branch first', () => {
    render(
      <BranchComparisonTable
        orders={[branchOrder('north', 'North Branch', 10), branchOrder('south', 'South', 900)]}
      />
    )

    const names = screen.getAllByTestId(/^branch-name-/).map((el) => el.textContent)
    expect(names[0]).toBe('South')
  })
})

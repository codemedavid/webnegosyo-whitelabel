import { render, screen, fireEvent, within } from '@testing-library/react'
import { BranchDirectory } from '@/components/admin/branch-directory'
import type { Outlet } from '@/types/database'
import type { RosterStaff } from '@/lib/outlets/branch-roster'
import type { AnalyticsOrderLike } from '@/lib/outlets/branch-analytics'

/**
 * The Branches index the owner lands on.
 *
 * It answers three questions at a glance — what branches do I have, how are
 * they doing, and who is running them — and hands off to a branch's own page
 * for anything that needs room. The states that must not be confused with each
 * other: a branch that has sold nothing, and a store whose takings this screen
 * cannot read at all. Rendering the second as zeroes would tell the owner their
 * branches earned nothing.
 */

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/actions/outlets', () => ({
  createOutletAction: jest.fn(async () => ({ success: true, data: {} })),
  reorderOutletsAction: jest.fn(async () => ({ success: true })),
  setOutletActiveAction: jest.fn(async () => ({ success: true, data: {} })),
  updateOutletAction: jest.fn(async () => ({ success: true, data: {} })),
}))

function makeOutlet(overrides: Partial<Outlet> = {}): Outlet {
  return {
    id: 'makati',
    tenant_id: 'tenant-1',
    name: 'Makati',
    slug: 'makati',
    address: '12 Ayala Ave',
    image_url: null,
    latitude: 14.55,
    longitude: 121.02,
    phone: null,
    operating_hours: null,
    timezone: null,
    supports_pickup: true,
    supports_delivery: true,
    supports_dine_in: false,
    delivery_radius_km: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeStaff(overrides: Partial<RosterStaff> = {}): RosterStaff {
  return {
    user_id: 'u1',
    outlet_id: 'makati',
    is_owner: false,
    display_name: 'Maria Santos',
    email: 'maria@example.com',
    permissions: ['orders'],
    ...overrides,
  }
}

function order(outletId: string, total: number): AnalyticsOrderLike {
  return { outlet_id: outletId, total, status: 'completed' } as AnalyticsOrderLike
}

const BGC = makeOutlet({ id: 'bgc', name: 'BGC', slug: 'bgc', address: '5th Ave', sort_order: 1 })

function renderDirectory(props: Partial<React.ComponentProps<typeof BranchDirectory>> = {}) {
  return render(
    <BranchDirectory
      tenantId="tenant-1"
      tenantSlug="demo"
      initialOutlets={[makeOutlet(), BGC]}
      staff={[]}
      orders={[]}
      {...props}
    />
  )
}

describe('BranchDirectory', () => {
  describe('the grid', () => {
    it('names every branch', () => {
      renderDirectory()

      expect(screen.getByText('Makati')).toBeInTheDocument()
      expect(screen.getByText('BGC')).toBeInTheDocument()
    })

    it('opens a branch on its own page', () => {
      renderDirectory()

      const card = screen.getByTestId('branch-card-makati')
      expect(within(card).getByRole('link', { name: /manage makati/i })).toHaveAttribute(
        'href',
        '/demo/admin/outlets/makati'
      )
    })

    it('shows the address so two branches in one city can be told apart', () => {
      renderDirectory()

      expect(screen.getByText('12 Ayala Ave')).toBeInTheDocument()
    })

    it('shows what a branch has taken', () => {
      renderDirectory({ orders: [order('makati', 400), order('makati', 200)] })

      const card = screen.getByTestId('branch-card-makati')
      expect(within(card).getByText(/₱600/)).toBeInTheDocument()
      expect(within(card).getByText(/2 orders/i)).toBeInTheDocument()
    })

    it('says a branch has sold nothing rather than showing it as zero pesos', () => {
      renderDirectory({ orders: [order('makati', 400)] })

      const card = screen.getByTestId('branch-card-bgc')
      expect(within(card).getByText(/no orders yet/i)).toBeInTheDocument()
      expect(within(card).queryByText(/₱0/)).not.toBeInTheDocument()
    })

    it('marks a branch customers cannot order from', () => {
      renderDirectory({ initialOutlets: [makeOutlet({ is_active: false })] })

      expect(within(screen.getByTestId('branch-card-makati')).getByText(/hidden/i)).toBeInTheDocument()
    })

    it('shows how many people run a branch', () => {
      renderDirectory({
        staff: [makeStaff({ user_id: 'u1' }), makeStaff({ user_id: 'u2' })],
      })

      expect(within(screen.getByTestId('branch-card-makati')).getByText(/2 staff/i)).toBeInTheDocument()
    })

    it('says a branch has nobody assigned rather than showing 0 staff', () => {
      renderDirectory({ staff: [] })

      expect(
        within(screen.getByTestId('branch-card-makati')).getByText(/no staff/i)
      ).toBeInTheDocument()
    })
  })

  describe('the summary strip', () => {
    it('counts the branches and how many are open', () => {
      renderDirectory({ initialOutlets: [makeOutlet(), { ...BGC, is_active: false }] })

      expect(screen.getByTestId('branch-summary-count')).toHaveTextContent('2')
      expect(screen.getByTestId('branch-summary-open')).toHaveTextContent('1')
    })

    it('names the branch earning the most', () => {
      renderDirectory({ orders: [order('makati', 400), order('bgc', 100)] })

      expect(screen.getByTestId('branch-summary-top')).toHaveTextContent('Makati')
    })

    it('shows store takings including orders no branch was attributed', () => {
      renderDirectory({
        orders: [order('makati', 400), { total: 100, status: 'completed' } as AnalyticsOrderLike],
      })

      expect(screen.getByTestId('branch-summary-revenue')).toHaveTextContent('₱500')
    })

    it('flags takings that reached no branch so the gap is explained', () => {
      renderDirectory({
        orders: [order('makati', 400), { total: 100, status: 'completed' } as AnalyticsOrderLike],
      })

      expect(screen.getByText(/not attributed to any branch/i)).toBeInTheDocument()
    })
  })

  describe('when takings cannot be read', () => {
    it('says so instead of showing every branch as having earned nothing', () => {
      renderDirectory({ orders: null })

      expect(screen.getByText(/order backend/i)).toBeInTheDocument()
      expect(screen.queryByTestId('branch-summary-revenue')).not.toBeInTheDocument()
    })

    it('still lets the merchant manage the branch', () => {
      renderDirectory({ orders: null })

      expect(screen.getByTestId('branch-card-makati')).toBeInTheDocument()
      expect(within(screen.getByTestId('branch-card-makati')).queryByText(/₱/)).not.toBeInTheDocument()
    })
  })

  describe('an empty store', () => {
    it('explains what adding a branch will do', () => {
      renderDirectory({ initialOutlets: [] })

      expect(screen.getByText(/no branches yet/i)).toBeInTheDocument()
    })

    it('shows no summary figures to read', () => {
      renderDirectory({ initialOutlets: [] })

      expect(screen.queryByTestId('branch-summary-count')).not.toBeInTheDocument()
    })
  })

  it('opens the new-branch form', () => {
    renderDirectory()

    fireEvent.click(screen.getByRole('button', { name: /add branch/i }))

    expect(screen.getByLabelText(/branch name/i)).toBeInTheDocument()
  })
})

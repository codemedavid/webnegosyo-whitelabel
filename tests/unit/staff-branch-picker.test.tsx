import { render, screen, fireEvent } from '@testing-library/react'
import { StaffManagementCard } from '@/components/admin/staff-management-card'
import type { StaffRecord } from '@/lib/staff-service'

/**
 * Assigning a staff account to a branch, from the owner's settings page.
 *
 * A single-location store must see the card exactly as it is today — no branch
 * control, no extra column — because `outlets` is empty for every tenant that
 * has not turned multi-branch on. The picker appears only once branches exist.
 */

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/actions/staff', () => ({
  createStaffAction: jest.fn(async () => ({ success: true, data: {} })),
  removeStaffAction: jest.fn(async () => ({ success: true })),
  resetStaffPasswordAction: jest.fn(async () => ({ success: true })),
  updateStaffPermissionsAction: jest.fn(async () => ({ success: true })),
  updateStaffBranchAction: jest.fn(async () => ({ success: true })),
}))

const OUTLETS = [
  { id: 'outlet-north', name: 'North Branch' },
  { id: 'outlet-south', name: 'South Branch' },
]

function makeStaff(overrides: Partial<StaffRecord> = {}): StaffRecord {
  return {
    user_id: 'user-1',
    tenant_id: 'tenant-1',
    role: 'admin',
    is_owner: false,
    outlet_id: null,
    permissions: ['orders'],
    display_name: 'Ana Cruz',
    email: 'ana@example.com',
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderCard(props: Partial<React.ComponentProps<typeof StaffManagementCard>> = {}) {
  return render(
    <StaffManagementCard
      tenantId="tenant-1"
      tenantSlug="demo"
      staff={[makeStaff()]}
      outlets={OUTLETS}
      {...props}
    />
  )
}

describe('staff branch assignment', () => {
  it('offers a branch choice when the store has branches', () => {
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: /add staff/i }))

    expect(screen.getByRole('radio', { name: /all branches/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /north branch/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /south branch/i })).toBeInTheDocument()
  })

  it('offers no branch choice for a single-location store', () => {
    renderCard({ outlets: [] })

    fireEvent.click(screen.getByRole('button', { name: /add staff/i }))

    expect(screen.queryByRole('radio', { name: /all branches/i })).not.toBeInTheDocument()
  })

  it('offers no branch choice when the prop is omitted entirely', () => {
    render(<StaffManagementCard tenantId="tenant-1" tenantSlug="demo" staff={[makeStaff()]} />)

    fireEvent.click(screen.getByRole('button', { name: /add staff/i }))

    expect(screen.queryByRole('radio', { name: /all branches/i })).not.toBeInTheDocument()
  })

  it('defaults a new account to all branches', () => {
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: /add staff/i }))

    expect(screen.getByRole('radio', { name: /all branches/i })).toBeChecked()
  })

  it('selects a branch when one is picked', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /add staff/i }))

    fireEvent.click(screen.getByRole('radio', { name: /north branch/i }))

    expect(screen.getByRole('radio', { name: /north branch/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /all branches/i })).not.toBeChecked()
  })

  it("shows a member's branch in the list", () => {
    renderCard({ staff: [makeStaff({ outlet_id: 'outlet-south' })] })

    expect(screen.getByText('South Branch')).toBeInTheDocument()
  })

  it('labels a store-wide member as covering all branches', () => {
    renderCard({ staff: [makeStaff({ outlet_id: null })] })

    expect(screen.getByText(/all branches/i)).toBeInTheDocument()
  })

  it('shows no branch label at all for a single-location store', () => {
    renderCard({ staff: [makeStaff({ outlet_id: null })], outlets: [] })

    expect(screen.queryByText(/all branches/i)).not.toBeInTheDocument()
  })

  it('names a branch that no longer exists rather than showing a bare id', () => {
    // A deleted branch sets the column to NULL, but a stale render between the
    // two must not leak a uuid into the merchant's staff list.
    renderCard({ staff: [makeStaff({ outlet_id: 'outlet-deleted' })] })

    expect(screen.queryByText('outlet-deleted')).not.toBeInTheDocument()
    expect(screen.getByText(/unknown branch/i)).toBeInTheDocument()
  })
})

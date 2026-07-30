import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { BranchTeamPanel } from '@/components/admin/branch-team-panel'
import { createStaffAction, updateStaffBranchAction } from '@/app/actions/staff'
import { MAX_STAFF_PER_TENANT } from '@/lib/staff-permissions'
import type { StaffRecord } from '@/lib/staff-service'

/**
 * Running one branch's team, from that branch's own page.
 *
 * The point of moving staff here is that the owner is already looking at the
 * branch: adding someone should not ask which branch again, and the seat count
 * shown must be this branch's, not the store's. The two things that would make
 * the panel dishonest are hiding the store-wide accounts that can also act on
 * this branch, and letting a branch take on a fourth person because the cap was
 * read store-wide.
 */

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/actions/staff', () => ({
  createStaffAction: jest.fn(async () => ({ success: true, data: {} })),
  removeStaffAction: jest.fn(async () => ({ success: true })),
  resetStaffPasswordAction: jest.fn(async () => ({ success: true })),
  updateStaffPermissionsAction: jest.fn(async () => ({ success: true })),
  updateStaffBranchAction: jest.fn(async () => ({ success: true })),
}))

const OUTLET = { id: 'makati', name: 'Makati' }
const OUTLETS = [OUTLET, { id: 'bgc', name: 'BGC' }]

function makeStaff(overrides: Partial<StaffRecord> = {}): StaffRecord {
  return {
    user_id: 'u1',
    tenant_id: 'tenant-1',
    role: 'admin',
    is_owner: false,
    outlet_id: 'makati',
    permissions: ['orders'],
    display_name: 'Maria Santos',
    email: 'maria@example.com',
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderPanel(props: Partial<React.ComponentProps<typeof BranchTeamPanel>> = {}) {
  return render(
    <BranchTeamPanel
      tenantId="tenant-1"
      tenantSlug="demo"
      outlet={OUTLET}
      outlets={OUTLETS}
      members={[makeStaff()]}
      storeWideMembers={[]}
      {...props}
    />
  )
}

beforeEach(() => jest.clearAllMocks())

describe('BranchTeamPanel', () => {
  describe('who is listed', () => {
    it('names the people posted to this branch', () => {
      renderPanel()

      expect(screen.getByText('Maria Santos')).toBeInTheDocument()
    })

    it('shows what each of them can reach', () => {
      renderPanel({ members: [makeStaff({ permissions: ['orders'] })] })

      const row = screen.getByTestId('staff-row-u1')
      expect(within(row).getByText('Orders')).toBeInTheDocument()
    })

    it('names the store-wide accounts that can also act on this branch', () => {
      renderPanel({
        members: [],
        storeWideMembers: [
          makeStaff({ user_id: 'u9', outlet_id: null, display_name: 'Jun Cruz' }),
        ],
      })

      expect(screen.getByText('Jun Cruz')).toBeInTheDocument()
      expect(screen.getByText(/store-wide/i)).toBeInTheDocument()
    })

    it('says the branch has nobody rather than showing an empty list', () => {
      renderPanel({ members: [] })

      expect(screen.getByText(/nobody is posted to makati/i)).toBeInTheDocument()
    })
  })

  describe('seats', () => {
    it('counts this branch usage against the per-branch cap', () => {
      renderPanel({ members: [makeStaff()] })

      expect(screen.getByTestId('branch-team-seats')).toHaveTextContent(
        `1 of ${MAX_STAFF_PER_TENANT}`
      )
    })

    it('does not count a store-wide account against the branch cap', () => {
      renderPanel({
        members: [makeStaff()],
        storeWideMembers: [makeStaff({ user_id: 'u9', outlet_id: null })],
      })

      expect(screen.getByTestId('branch-team-seats')).toHaveTextContent(
        `1 of ${MAX_STAFF_PER_TENANT}`
      )
    })

    it('stops the owner adding past the cap', () => {
      const full = Array.from({ length: MAX_STAFF_PER_TENANT }, (_, i) =>
        makeStaff({ user_id: `u${i}`, email: `u${i}@example.com` })
      )
      renderPanel({ members: full })

      expect(screen.getByRole('button', { name: /add to makati/i })).toBeDisabled()
    })
  })

  describe('adding someone', () => {
    it('does not ask which branch — the page already says', () => {
      renderPanel()

      fireEvent.click(screen.getByRole('button', { name: /add to makati/i }))

      expect(screen.queryByRole('radio', { name: /all branches/i })).not.toBeInTheDocument()
    })

    it('posts the new account to this branch', async () => {
      renderPanel()

      fireEvent.click(screen.getByRole('button', { name: /add to makati/i }))
      fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Ana Cruz' } })
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'ana@example.com' } })
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'supersecret' } })
      fireEvent.click(screen.getByRole('button', { name: /^add staff$/i }))

      await waitFor(() => expect(createStaffAction).toHaveBeenCalled())
      expect(createStaffAction).toHaveBeenCalledWith(
        'tenant-1',
        'demo',
        expect.objectContaining({ outletId: 'makati', displayName: 'Ana Cruz' })
      )
    })
  })

  describe('moving someone', () => {
    it('offers the store’s other branches', () => {
      renderPanel()

      fireEvent.click(screen.getByRole('button', { name: /move maria santos/i }))

      expect(screen.getByRole('radio', { name: 'BGC' })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /all branches/i })).toBeInTheDocument()
    })

    it('reassigns them to the branch chosen', async () => {
      renderPanel()

      fireEvent.click(screen.getByRole('button', { name: /move maria santos/i }))
      fireEvent.click(screen.getByRole('radio', { name: 'BGC' }))
      fireEvent.click(screen.getByRole('button', { name: /^move$/i }))

      await waitFor(() => expect(updateStaffBranchAction).toHaveBeenCalled())
      expect(updateStaffBranchAction).toHaveBeenCalledWith('tenant-1', 'demo', 'u1', 'bgc')
    })

    it('widens them to the whole store when all branches is chosen', async () => {
      renderPanel()

      fireEvent.click(screen.getByRole('button', { name: /move maria santos/i }))
      fireEvent.click(screen.getByRole('radio', { name: /all branches/i }))
      fireEvent.click(screen.getByRole('button', { name: /^move$/i }))

      await waitFor(() => expect(updateStaffBranchAction).toHaveBeenCalled())
      expect(updateStaffBranchAction).toHaveBeenCalledWith('tenant-1', 'demo', 'u1', null)
    })
  })

  describe('the rest of the account', () => {
    it('can change what a member reaches', () => {
      renderPanel()

      const row = screen.getByTestId('staff-row-u1')
      expect(within(row).getByRole('button', { name: /permissions/i })).toBeInTheDocument()
    })

    it('can reset their password and remove them', () => {
      renderPanel()

      const row = screen.getByTestId('staff-row-u1')
      expect(within(row).getByRole('button', { name: /reset password/i })).toBeInTheDocument()
      expect(within(row).getByRole('button', { name: /remove/i })).toBeInTheDocument()
    })
  })
})

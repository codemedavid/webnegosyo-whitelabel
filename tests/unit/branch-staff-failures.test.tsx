import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { BranchTeamPanel } from '@/components/admin/branch-team-panel'
import { BranchDirectory } from '@/components/admin/branch-directory'
import {
  createStaffAction,
  removeStaffAction,
  updateStaffBranchAction,
} from '@/app/actions/staff'
import { reorderOutletsAction, setOutletActiveAction } from '@/app/actions/outlets'
import type { RosterStaff } from '@/lib/outlets/branch-roster'
import type { Outlet } from '@/types/database'

/**
 * What the screen does when a write is refused.
 *
 * These paths matter more than the happy ones. A branch manager who is told
 * "moved" when the server refused the move will believe someone has access
 * they do not have; a reorder that silently keeps the new order on screen
 * after the save failed leaves the customer-facing branch picker in a
 * different order from the admin. Every refusal must surface, and nothing
 * optimistic may survive one.
 */

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('@/app/actions/staff', () => ({
  createStaffAction: jest.fn(),
  removeStaffAction: jest.fn(),
  resetStaffPasswordAction: jest.fn(),
  updateStaffPermissionsAction: jest.fn(),
  updateStaffBranchAction: jest.fn(),
}))
jest.mock('@/app/actions/outlets', () => ({
  createOutletAction: jest.fn(),
  reorderOutletsAction: jest.fn(),
  setOutletActiveAction: jest.fn(),
  updateOutletAction: jest.fn(),
}))

const OUTLET = { id: 'makati', name: 'Makati' }
const OUTLETS = [OUTLET, { id: 'bgc', name: 'BGC' }]

function member(overrides: Partial<RosterStaff> = {}): RosterStaff {
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

function makeOutlet(overrides: Partial<Outlet> = {}): Outlet {
  return {
    id: 'makati',
    tenant_id: 'tenant-1',
    name: 'Makati',
    slug: 'makati',
    address: null,
    image_url: null,
    latitude: null,
    longitude: null,
    phone: null,
    operating_hours: null,
    timezone: null,
    supports_pickup: true,
    supports_delivery: false,
    supports_dine_in: false,
    delivery_radius_km: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderTeam() {
  return render(
    <BranchTeamPanel
      tenantId="tenant-1"
      tenantSlug="demo"
      outlet={OUTLET}
      outlets={OUTLETS}
      members={[member()]}
      storeWideMembers={[]}
    />
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  refresh.mockClear()
})

describe('when a staff write is refused', () => {
  it('reports why a move failed instead of claiming it worked', async () => {
    ;(updateStaffBranchAction as jest.Mock).mockResolvedValue({
      success: false,
      error: 'This branch already has the maximum of 3 staff accounts',
    })
    renderTeam()

    fireEvent.click(screen.getByRole('button', { name: /move maria santos/i }))
    fireEvent.click(screen.getByRole('radio', { name: 'BGC' }))
    fireEvent.click(screen.getByRole('button', { name: /^move$/i }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'This branch already has the maximum of 3 staff accounts'
      )
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('keeps the move dialog open so the refusal can be acted on', async () => {
    ;(updateStaffBranchAction as jest.Mock).mockResolvedValue({ success: false, error: 'Nope' })
    renderTeam()

    fireEvent.click(screen.getByRole('button', { name: /move maria santos/i }))
    fireEvent.click(screen.getByRole('radio', { name: 'BGC' }))
    fireEvent.click(screen.getByRole('button', { name: /^move$/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /^move$/i })).toBeInTheDocument()
  })

  it('reports a refused removal', async () => {
    ;(removeStaffAction as jest.Mock).mockResolvedValue({
      success: false,
      error: 'You cannot manage staff for that branch',
    })
    renderTeam()

    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('You cannot manage staff for that branch')
    )
  })

  it('reports a refused add and keeps what was typed', async () => {
    ;(createStaffAction as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Enter a valid email address',
    })
    renderTeam()

    fireEvent.click(screen.getByRole('button', { name: /add to makati/i }))
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Ana Cruz' } })
    fireEvent.click(screen.getByRole('button', { name: /^add staff$/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Enter a valid email address'))
    expect(screen.getByLabelText(/name/i)).toHaveValue('Ana Cruz')
  })
})

describe('when a branch write is refused', () => {
  const BGC = makeOutlet({ id: 'bgc', name: 'BGC', slug: 'bgc', sort_order: 1 })

  function renderDirectory() {
    return render(
      <BranchDirectory
        tenantId="tenant-1"
        tenantSlug="demo"
        initialOutlets={[makeOutlet(), BGC]}
        staff={[]}
        orders={[]}
      />
    )
  }

  it('puts the branches back in their saved order when the reorder fails', async () => {
    ;(reorderOutletsAction as jest.Mock).mockResolvedValue({ success: false, error: 'Denied' })
    renderDirectory()

    fireEvent.click(screen.getByRole('button', { name: /move bgc up/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Denied'))
    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(names).toEqual(['Makati', 'BGC'])
  })

  it('does not write the same order back when a branch is already at the top', () => {
    renderDirectory()

    fireEvent.click(screen.getByRole('button', { name: /move bgc down/i }))

    expect(reorderOutletsAction).not.toHaveBeenCalled()
  })

  it('reports a refused hide instead of showing the branch as hidden', async () => {
    ;(setOutletActiveAction as jest.Mock).mockResolvedValue({ success: false, error: 'Denied' })
    renderDirectory()

    fireEvent.click(screen.getAllByRole('button', { name: /^hide$/i })[0])

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Denied'))
    expect(screen.getAllByRole('button', { name: /^hide$/i })).toHaveLength(2)
  })
})

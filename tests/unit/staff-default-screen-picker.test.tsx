import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StaffManagementCard } from '@/components/admin/staff-management-card'
import { createStaffAction, updateStaffDefaultScreenAction } from '@/app/actions/staff'
import type { StaffRecord } from '@/lib/staff-service'

/**
 * Choosing the screen a staff account opens on, from the owner's staff list.
 *
 * The picker's job is to make an impossible setting unreachable: an owner who
 * pins a cashier to Analytics would see it save and then do nothing, because
 * the app refuses it at launch. So the options are filtered by the permissions
 * being granted in the same form, and they move when those permissions move.
 */

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/actions/staff', () => ({
  createStaffAction: jest.fn(async () => ({ success: true, data: {} })),
  removeStaffAction: jest.fn(async () => ({ success: true })),
  resetStaffPasswordAction: jest.fn(async () => ({ success: true })),
  updateStaffPermissionsAction: jest.fn(async () => ({ success: true })),
  updateStaffBranchAction: jest.fn(async () => ({ success: true })),
  updateStaffDefaultScreenAction: jest.fn(async () => ({ success: true })),
}))

function makeStaff(overrides: Partial<StaffRecord> = {}): StaffRecord {
  return {
    user_id: 'user-1',
    tenant_id: 'tenant-1',
    role: 'admin',
    is_owner: false,
    outlet_id: null,
    permissions: ['pos'],
    display_name: 'Ana Cruz',
    email: 'ana@example.com',
    default_tab: null,
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderCard(props: Partial<React.ComponentProps<typeof StaffManagementCard>> = {}) {
  return render(
    <StaffManagementCard
      tenantId="tenant-1"
      tenantSlug="demo"
      staff={[makeStaff()]}
      {...props}
    />
  )
}

function openAddForm() {
  fireEvent.click(screen.getByRole('button', { name: /add staff/i }))
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('picking a default screen for a new account', () => {
  it('offers the home screen before any permission is ticked', () => {
    renderCard()
    openAddForm()

    expect(screen.getByRole('radio', { name: /home/i })).toBeInTheDocument()
  })

  it('opens on no preference, so an unconfigured account behaves as it does today', () => {
    renderCard()
    openAddForm()

    expect(screen.getByRole('radio', { name: /no preference/i })).toBeChecked()
  })

  it('does not offer a screen the permissions being granted cannot open', () => {
    renderCard()
    openAddForm()

    expect(screen.queryByRole('radio', { name: /^register$/i })).not.toBeInTheDocument()
  })

  it('offers the register once the POS permission is ticked', async () => {
    renderCard()
    openAddForm()

    fireEvent.click(screen.getByRole('checkbox', { name: /take orders at the counter/i }))

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /^register$/i })).toBeInTheDocument()
    })
  })

  it('drops a chosen screen when the permission behind it is unticked', async () => {
    // Otherwise the form would submit a screen the service is about to reject,
    // and the owner would never learn their choice did not stick.
    renderCard()
    openAddForm()

    fireEvent.click(screen.getByRole('checkbox', { name: /take orders at the counter/i }))
    await waitFor(() => screen.getByRole('radio', { name: /^register$/i }))
    fireEvent.click(screen.getByRole('radio', { name: /^register$/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /take orders at the counter/i }))

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /no preference/i })).toBeChecked()
    })
  })

  it('submits the chosen screen with the new account', async () => {
    renderCard()
    openAddForm()

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Ben Cruz' } })
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'ben@example.com' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'supersecret1' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /take orders at the counter/i }))
    await waitFor(() => screen.getByRole('radio', { name: /^register$/i }))
    fireEvent.click(screen.getByRole('radio', { name: /^register$/i }))

    // The trigger and the dialog's submit share a label; the submit is the one
    // rendered last, inside the open dialog.
    const submits = screen.getAllByRole('button', { name: /add staff/i })
    fireEvent.click(submits[submits.length - 1])

    await waitFor(() => {
      expect(createStaffAction).toHaveBeenCalledWith(
        'tenant-1',
        'demo',
        expect.objectContaining({ defaultTab: 'pos' })
      )
    })
  })
})

describe('changing the default screen of an existing account', () => {
  it('shows the pinned screen on the roster row', () => {
    renderCard({ staff: [makeStaff({ default_tab: 'pos' })] })

    expect(screen.getByText(/opens on register/i)).toBeInTheDocument()
  })

  it('says nothing about a screen for an account that has none', () => {
    renderCard({ staff: [makeStaff({ default_tab: null })] })

    expect(screen.queryByText(/opens on/i)).not.toBeInTheDocument()
  })

  it('saves the screen the owner picked', async () => {
    renderCard({ staff: [makeStaff({ permissions: ['pos'] })] })

    fireEvent.click(screen.getByRole('button', { name: /default screen/i }))
    fireEvent.click(await screen.findByRole('radio', { name: /^register$/i }))
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(updateStaffDefaultScreenAction).toHaveBeenCalledWith(
        'tenant-1',
        'demo',
        'user-1',
        'pos'
      )
    })
  })

  it('unpins an account when the owner picks no preference', async () => {
    renderCard({ staff: [makeStaff({ permissions: ['pos'], default_tab: 'pos' })] })

    fireEvent.click(screen.getByRole('button', { name: /default screen/i }))
    fireEvent.click(await screen.findByRole('radio', { name: /no preference/i }))
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(updateStaffDefaultScreenAction).toHaveBeenCalledWith(
        'tenant-1',
        'demo',
        'user-1',
        null
      )
    })
  })

  it('offers only screens this account can open', async () => {
    renderCard({ staff: [makeStaff({ permissions: ['pos'] })] })

    fireEvent.click(screen.getByRole('button', { name: /default screen/i }))

    expect(await screen.findByRole('radio', { name: /^register$/i })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^analytics$/i })).not.toBeInTheDocument()
  })

  it('hides the branch screens from a single-location store', async () => {
    renderCard({ staff: [makeStaff({ permissions: null })] })

    fireEvent.click(screen.getByRole('button', { name: /default screen/i }))
    await screen.findByRole('radio', { name: /no preference/i })

    expect(screen.queryByRole('radio', { name: /compare branches/i })).not.toBeInTheDocument()
  })
})

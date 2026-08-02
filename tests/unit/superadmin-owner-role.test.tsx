import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { TenantUsersList } from '@/components/superadmin/tenant-users-list'
import { AddTenantUserDialog } from '@/components/superadmin/add-tenant-user-dialog'
import { createTenantUser, setTenantOwner, type TenantUser } from '@/actions/users'

/**
 * Naming a store's owner from the superadmin panel.
 *
 * Every tenant created through this panel has so far been left with no owner
 * at all, because the add-user path never set the flag `canManageStaff` reads.
 * The two things that would make this feature dishonest are letting a store
 * end up with two owners, and letting one silently end up with none.
 */

jest.mock('@/actions/users', () => ({
  createTenantUser: jest.fn(async () => ({
    success: true,
    user: { user_id: 'new_user', email: 'new@example.com', is_owner: false },
  })),
  removeTenantUser: jest.fn(async () => ({ success: true })),
  setTenantOwner: jest.fn(async () => ({ success: true })),
}))

const mockCreate = createTenantUser as jest.MockedFunction<typeof createTenantUser>
const mockSetOwner = setTenantOwner as jest.MockedFunction<typeof setTenantOwner>

function makeUser(overrides: Partial<TenantUser> = {}): TenantUser {
  return {
    user_id: 'user_1',
    email: 'admin@example.com',
    role: 'admin',
    is_owner: false,
    tenant_id: 'tenant-1',
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

const OWNER = makeUser({ user_id: 'owner_1', email: 'owner@example.com', is_owner: true })
const ADMIN = makeUser({ user_id: 'admin_1', email: 'staff@example.com' })

function renderList(users: TenantUser[]) {
  return render(
    <TenantUsersList tenantId="tenant-1" tenantName="Bear Coffee" users={users} />
  )
}

function renderDialog(props: Partial<React.ComponentProps<typeof AddTenantUserDialog>> = {}) {
  return render(
    <AddTenantUserDialog
      tenantId="tenant-1"
      tenantName="Bear Coffee"
      open
      onOpenChange={jest.fn()}
      existingUsers={[]}
      {...props}
    />
  )
}

async function fillCredentials() {
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: 'new@example.com' },
  })
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: 'sup3rsecret' },
  })
  fireEvent.change(screen.getByLabelText(/confirm password/i), {
    target: { value: 'sup3rsecret' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('adding a store owner', () => {
  it('offers a Store Owner role alongside the plain admin role', () => {
    renderDialog()

    expect(screen.getByRole('radio', { name: /store owner/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^admin/i })).toBeInTheDocument()
  })

  it('defaults to Store Owner when the store has nobody in charge', () => {
    renderDialog({ existingUsers: [ADMIN] })

    expect(screen.getByRole('radio', { name: /store owner/i })).toBeChecked()
  })

  it('defaults to Admin once the store already has an owner', () => {
    renderDialog({ existingUsers: [OWNER] })

    expect(screen.getByRole('radio', { name: /^admin/i })).toBeChecked()
  })

  it('does not offer a second owner when the store already has one', () => {
    renderDialog({ existingUsers: [OWNER] })

    expect(screen.getByRole('radio', { name: /store owner/i })).toBeDisabled()
  })

  it('creates the account as the owner when Store Owner is chosen', async () => {
    // Arrange
    renderDialog({ existingUsers: [] })
    await fillCredentials()
    fireEvent.click(screen.getByRole('radio', { name: /store owner/i }))

    // Act
    fireEvent.click(screen.getByRole('button', { name: /create user/i }))

    // Assert
    await waitFor(() => expect(mockCreate).toHaveBeenCalled())
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ is_owner: true }))
  })

  it('creates a plain admin when Admin is chosen', async () => {
    renderDialog({ existingUsers: [OWNER] })
    await fillCredentials()

    fireEvent.click(screen.getByRole('button', { name: /create user/i }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalled())
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ is_owner: false }))
  })
})

describe('the tenant user list', () => {
  it('marks which account owns the store', () => {
    renderList([OWNER, ADMIN])

    const ownerRow = screen.getByText('owner@example.com').closest('div[class*="group"]')
    expect(within(ownerRow as HTMLElement).getByText(/owner/i)).toBeInTheDocument()
  })

  it('warns when a staffed store has nobody in charge', () => {
    renderList([ADMIN])

    expect(screen.getByText(/no owner/i)).toBeInTheDocument()
  })

  it('stays quiet when the store has an owner', () => {
    renderList([OWNER, ADMIN])

    expect(screen.queryByText(/no owner/i)).not.toBeInTheDocument()
  })

  it('hands the store over when an admin is made owner', async () => {
    // Arrange
    renderList([OWNER, ADMIN])
    const adminRow = screen.getByText('staff@example.com').closest('div[class*="group"]')

    // Act
    fireEvent.click(within(adminRow as HTMLElement).getByRole('button', { name: /make owner/i }))
    fireEvent.click(screen.getByRole('button', { name: /^transfer ownership$/i }))

    // Assert
    await waitFor(() => expect(mockSetOwner).toHaveBeenCalled())
    expect(mockSetOwner).toHaveBeenCalledWith({ tenant_id: 'tenant-1', user_id: 'admin_1' })
  })

  it('names who loses the store before the transfer is confirmed', () => {
    renderList([OWNER, ADMIN])
    const adminRow = screen.getByText('staff@example.com').closest('div[class*="group"]')

    fireEvent.click(within(adminRow as HTMLElement).getByRole('button', { name: /make owner/i }))

    expect(screen.getByText(/owner@example\.com/)).toBeInTheDocument()
  })

  it('does not offer to make the sitting owner the owner again', () => {
    renderList([OWNER, ADMIN])
    const ownerRow = screen.getByText('owner@example.com').closest('div[class*="group"]')

    expect(
      within(ownerRow as HTMLElement).queryByRole('button', { name: /make owner/i })
    ).not.toBeInTheDocument()
  })

  it('rolls the badge back when the transfer fails', async () => {
    // Arrange
    mockSetOwner.mockResolvedValueOnce({ error: 'Staff limit reached' })
    renderList([OWNER, ADMIN])
    const adminRow = screen.getByText('staff@example.com').closest('div[class*="group"]')

    // Act
    fireEvent.click(within(adminRow as HTMLElement).getByRole('button', { name: /make owner/i }))
    fireEvent.click(screen.getByRole('button', { name: /^transfer ownership$/i }))

    // Assert — the original owner keeps the badge
    await waitFor(() => expect(mockSetOwner).toHaveBeenCalled())
    await waitFor(() => {
      const restored = screen.getByText('owner@example.com').closest('div[class*="group"]')
      expect(within(restored as HTMLElement).getByText(/owner/i)).toBeInTheDocument()
    })
  })
})

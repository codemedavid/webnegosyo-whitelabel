import {
  createStaff,
  updateStaffDefaultScreen,
  updateStaffPermissions,
  type StaffRecord,
  type StaffStore,
} from '@/lib/staff-service'

/**
 * Storing the screen a staff account opens on.
 *
 * The screen and the permission that unlocks it are two columns that can
 * disagree, and the moment they do is an ordinary one: an owner unticks
 * Analytics from a member who was pinned to the Analytics screen. The app
 * survives that (it falls back at launch), but leaving the stale value in the
 * column means the setting silently lies to the next person who opens the
 * dialog. So the invariant is enforced where the change happens.
 */

interface FakeState {
  staff: StaffRecord[]
}

function makeFakeStore(initialStaff: StaffRecord[] = []): {
  store: StaffStore
  state: FakeState
} {
  const state: FakeState = { staff: [...initialStaff] }
  let nextId = 1

  const store: StaffStore = {
    listStaff: async (tenantId) => state.staff.filter((s) => s.tenant_id === tenantId),
    createAuthUser: async () => ({ userId: `user_${nextId++}` }),
    insertStaffRow: async (row) => {
      state.staff = [...state.staff, row]
    },
    updateStaffRow: async (userId, patch) => {
      state.staff = state.staff.map((s) => (s.user_id === userId ? { ...s, ...patch } : s))
    },
    deleteAuthUser: async (userId) => {
      state.staff = state.staff.filter((s) => s.user_id !== userId)
    },
    updateAuthPassword: async () => undefined,
  }

  return { store, state }
}

function makeStaffRecord(overrides: Partial<StaffRecord> = {}): StaffRecord {
  return {
    user_id: 'user_existing',
    tenant_id: 'tenant-1',
    role: 'admin',
    is_owner: false,
    permissions: ['orders'],
    display_name: 'Existing Staff',
    email: 'existing@example.com',
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

const validInput = {
  email: 'new.staff@example.com',
  password: 'supersecret1',
  displayName: 'New Staff',
  permissions: ['pos'],
}

function findStaff(state: FakeState, userId: string): StaffRecord {
  const record = state.staff.find((s) => s.user_id === userId)
  if (!record) throw new Error('staff row missing from the fake store')
  return record
}

describe('createStaff — default screen', () => {
  it('stores the screen the owner pinned the new account to', async () => {
    const { store, state } = makeFakeStore()

    const created = await createStaff(store, 'tenant-1', { ...validInput, defaultTab: 'pos' })

    expect(created.default_tab).toBe('pos')
    expect(findStaff(state, created.user_id).default_tab).toBe('pos')
  })

  it('leaves the screen unset when the owner did not choose one', async () => {
    const { store } = makeFakeStore()

    const created = await createStaff(store, 'tenant-1', validInput)

    expect(created.default_tab).toBeNull()
  })

  it('refuses to pin an account to a screen its permissions do not open', async () => {
    // Saving it would look like it worked and then do nothing at launch.
    const { store } = makeFakeStore()

    const created = await createStaff(store, 'tenant-1', {
      ...validInput,
      permissions: ['pos'],
      defaultTab: 'analytics',
    })

    expect(created.default_tab).toBeNull()
  })

  it('ignores a screen the app does not have', async () => {
    const { store } = makeFakeStore()

    const created = await createStaff(store, 'tenant-1', {
      ...validInput,
      defaultTab: 'reports-v1',
    })

    expect(created.default_tab).toBeNull()
  })
})

describe('updateStaffDefaultScreen', () => {
  it('pins an existing account to a screen its permissions open', async () => {
    const { store, state } = makeFakeStore([makeStaffRecord({ permissions: ['pos'] })])

    await updateStaffDefaultScreen(store, 'tenant-1', 'user_existing', 'pos')

    expect(findStaff(state, 'user_existing').default_tab).toBe('pos')
  })

  it('clears the screen when the owner picks no preference', async () => {
    const { store, state } = makeFakeStore([
      makeStaffRecord({ permissions: ['pos'], default_tab: 'pos' }),
    ])

    await updateStaffDefaultScreen(store, 'tenant-1', 'user_existing', null)

    expect(findStaff(state, 'user_existing').default_tab).toBeNull()
  })

  it('stores nothing when the screen is one this account cannot open', async () => {
    const { store, state } = makeFakeStore([makeStaffRecord({ permissions: ['pos'] })])

    await updateStaffDefaultScreen(store, 'tenant-1', 'user_existing', 'analytics')

    expect(findStaff(state, 'user_existing').default_tab).toBeNull()
  })

  it('honours any screen for a member holding full access', async () => {
    // permissions null is a legacy admin, not an account with no grants.
    const { store, state } = makeFakeStore([makeStaffRecord({ permissions: null })])

    await updateStaffDefaultScreen(store, 'tenant-1', 'user_existing', 'analytics')

    expect(findStaff(state, 'user_existing').default_tab).toBe('analytics')
  })

  it('refuses to touch the owner account', async () => {
    const { store } = makeFakeStore([makeStaffRecord({ is_owner: true })])

    await expect(
      updateStaffDefaultScreen(store, 'tenant-1', 'user_existing', 'pos')
    ).rejects.toThrow(/owner/i)
  })

  it('refuses a member of another tenant', async () => {
    const { store } = makeFakeStore([makeStaffRecord({ tenant_id: 'tenant-2' })])

    await expect(
      updateStaffDefaultScreen(store, 'tenant-1', 'user_existing', 'pos')
    ).rejects.toThrow(/not found/i)
  })

  it('refuses a branch admin reaching into another branch', async () => {
    const { store } = makeFakeStore([makeStaffRecord({ outlet_id: 'outlet-south' })])

    await expect(
      updateStaffDefaultScreen(store, 'tenant-1', 'user_existing', 'pos', {
        actor: {
          role: 'admin',
          is_owner: false,
          permissions: ['branch_staff'],
          outlet_id: 'outlet-north',
        },
      })
    ).rejects.toThrow(/cannot manage staff/i)
  })
})

describe('updateStaffPermissions — keeping the pinned screen honest', () => {
  it('drops a pinned screen the new permissions no longer open', async () => {
    const { store, state } = makeFakeStore([
      makeStaffRecord({ permissions: ['analytics'], default_tab: 'analytics' }),
    ])

    await updateStaffPermissions(store, 'tenant-1', 'user_existing', ['pos'])

    expect(findStaff(state, 'user_existing').default_tab).toBeNull()
  })

  it('keeps a pinned screen the new permissions still open', async () => {
    const { store, state } = makeFakeStore([
      makeStaffRecord({ permissions: ['pos'], default_tab: 'pos' }),
    ])

    await updateStaffPermissions(store, 'tenant-1', 'user_existing', ['pos', 'orders'])

    expect(findStaff(state, 'user_existing').default_tab).toBe('pos')
  })

  it('keeps a pinned screen that needs no permission at all', async () => {
    // The home screen is open to every account, so no permission change can
    // strand someone pinned to it.
    const { store, state } = makeFakeStore([
      makeStaffRecord({ permissions: ['analytics'], default_tab: 'dashboard' }),
    ])

    await updateStaffPermissions(store, 'tenant-1', 'user_existing', ['pos'])

    expect(findStaff(state, 'user_existing').default_tab).toBe('dashboard')
  })

  it('leaves an unpinned account unpinned', async () => {
    const { store, state } = makeFakeStore([makeStaffRecord({ default_tab: null })])

    await updateStaffPermissions(store, 'tenant-1', 'user_existing', ['pos'])

    expect(findStaff(state, 'user_existing').default_tab).toBeNull()
  })
})

import {
  createStaff,
  updateStaffPermissions,
  resetStaffPassword,
  removeStaff,
  type StaffRecord,
  type StaffStore,
} from '@/lib/staff-service'

interface FakeState {
  staff: StaffRecord[]
  authUsers: Map<string, { email: string; password: string }>
}

function makeFakeStore(initialStaff: StaffRecord[] = []): { store: StaffStore; state: FakeState } {
  const state: FakeState = {
    staff: [...initialStaff],
    authUsers: new Map(
      initialStaff.map((s) => [s.user_id, { email: s.email ?? '', password: 'existing-pass' }])
    ),
  }
  let nextId = 1

  const store: StaffStore = {
    listStaff: async (tenantId) => state.staff.filter((s) => s.tenant_id === tenantId),
    createAuthUser: async ({ email, password }) => {
      const userId = `user_${nextId++}`
      state.authUsers.set(userId, { email, password })
      return { userId }
    },
    insertStaffRow: async (row) => {
      state.staff = [...state.staff, row]
    },
    updateStaffRow: async (userId, patch) => {
      state.staff = state.staff.map((s) => (s.user_id === userId ? { ...s, ...patch } : s))
    },
    deleteAuthUser: async (userId) => {
      state.authUsers.delete(userId)
      state.staff = state.staff.filter((s) => s.user_id !== userId)
    },
    updateAuthPassword: async (userId, password) => {
      const existing = state.authUsers.get(userId)
      if (!existing) throw new Error('auth user not found')
      state.authUsers.set(userId, { ...existing, password })
    },
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
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

const validInput = {
  email: 'new.staff@example.com',
  password: 'supersecret1',
  displayName: 'New Staff',
  permissions: ['orders'],
}

describe('createStaff', () => {
  it('creates an auth user and staff row with the given permissions', async () => {
    const { store, state } = makeFakeStore()

    const created = await createStaff(store, 'tenant-1', validInput)

    expect(created.user_id).toBe('user_1')
    expect(state.staff).toHaveLength(1)
    expect(state.staff[0]).toMatchObject({
      tenant_id: 'tenant-1',
      role: 'admin',
      is_owner: false,
      permissions: ['orders'],
      display_name: 'New Staff',
      email: 'new.staff@example.com',
    })
    expect(state.authUsers.get('user_1')).toEqual({
      email: 'new.staff@example.com',
      password: 'supersecret1',
    })
  })

  it('rejects when the tenant already has 3 staff members', async () => {
    const existing = [1, 2, 3].map((n) =>
      makeStaffRecord({ user_id: `user_s${n}`, email: `s${n}@example.com` })
    )
    const { store } = makeFakeStore(existing)

    await expect(createStaff(store, 'tenant-1', validInput)).rejects.toThrow(/maximum of 3/i)
  })

  it('does not count the owner against the staff limit', async () => {
    const existing = [
      makeStaffRecord({ user_id: 'owner', is_owner: true, permissions: null }),
      makeStaffRecord({ user_id: 'user_s1', email: 's1@example.com' }),
      makeStaffRecord({ user_id: 'user_s2', email: 's2@example.com' }),
    ]
    const { store, state } = makeFakeStore(existing)

    await createStaff(store, 'tenant-1', validInput)

    expect(state.staff).toHaveLength(4)
  })

  it('ignores staff of other tenants when counting the limit', async () => {
    const existing = [1, 2, 3].map((n) =>
      makeStaffRecord({ user_id: `user_o${n}`, tenant_id: 'tenant-other' })
    )
    const { store, state } = makeFakeStore(existing)

    await createStaff(store, 'tenant-1', validInput)

    expect(state.staff.filter((s) => s.tenant_id === 'tenant-1')).toHaveLength(1)
  })

  it('rejects invalid email addresses', async () => {
    const { store } = makeFakeStore()
    await expect(
      createStaff(store, 'tenant-1', { ...validInput, email: 'not-an-email' })
    ).rejects.toThrow(/email/i)
  })

  it('rejects passwords shorter than 8 characters', async () => {
    const { store } = makeFakeStore()
    await expect(
      createStaff(store, 'tenant-1', { ...validInput, password: 'short' })
    ).rejects.toThrow(/password/i)
  })

  it('rejects unknown permission keys', async () => {
    const { store } = makeFakeStore()
    await expect(
      createStaff(store, 'tenant-1', { ...validInput, permissions: ['root'] })
    ).rejects.toThrow(/root/)
  })

  it('rejects an empty display name', async () => {
    const { store } = makeFakeStore()
    await expect(
      createStaff(store, 'tenant-1', { ...validInput, displayName: '  ' })
    ).rejects.toThrow(/name/i)
  })
})

describe('updateStaffPermissions', () => {
  it('updates permissions for a staff member of the tenant', async () => {
    const { store, state } = makeFakeStore([makeStaffRecord()])

    await updateStaffPermissions(store, 'tenant-1', 'user_existing', ['orders', 'menu'])

    expect(state.staff[0].permissions).toEqual(['orders', 'menu'])
  })

  it('refuses to modify the owner', async () => {
    const { store } = makeFakeStore([
      makeStaffRecord({ user_id: 'owner', is_owner: true, permissions: null }),
    ])

    await expect(
      updateStaffPermissions(store, 'tenant-1', 'owner', ['orders'])
    ).rejects.toThrow(/owner/i)
  })

  it('refuses to touch users outside the tenant', async () => {
    const { store } = makeFakeStore([makeStaffRecord({ tenant_id: 'tenant-other' })])

    await expect(
      updateStaffPermissions(store, 'tenant-1', 'user_existing', ['orders'])
    ).rejects.toThrow(/not found/i)
  })
})

describe('resetStaffPassword', () => {
  it('resets the password for a staff member', async () => {
    const { store, state } = makeFakeStore([makeStaffRecord()])

    await resetStaffPassword(store, 'tenant-1', 'user_existing', 'newpassword9')

    expect(state.authUsers.get('user_existing')?.password).toBe('newpassword9')
  })

  it('rejects short passwords', async () => {
    const { store } = makeFakeStore([makeStaffRecord()])

    await expect(
      resetStaffPassword(store, 'tenant-1', 'user_existing', 'short')
    ).rejects.toThrow(/password/i)
  })

  it('refuses to reset the owner password', async () => {
    const { store } = makeFakeStore([
      makeStaffRecord({ user_id: 'owner', is_owner: true, permissions: null }),
    ])

    await expect(
      resetStaffPassword(store, 'tenant-1', 'owner', 'newpassword9')
    ).rejects.toThrow(/owner/i)
  })
})

describe('removeStaff', () => {
  it('removes a staff member and their auth user', async () => {
    const { store, state } = makeFakeStore([makeStaffRecord()])

    await removeStaff(store, 'tenant-1', 'user_existing')

    expect(state.staff).toHaveLength(0)
    expect(state.authUsers.has('user_existing')).toBe(false)
  })

  it('refuses to remove the owner', async () => {
    const { store } = makeFakeStore([
      makeStaffRecord({ user_id: 'owner', is_owner: true, permissions: null }),
    ])

    await expect(removeStaff(store, 'tenant-1', 'owner')).rejects.toThrow(/owner/i)
  })

  it('refuses to remove users outside the tenant', async () => {
    const { store } = makeFakeStore([makeStaffRecord({ tenant_id: 'tenant-other' })])

    await expect(removeStaff(store, 'tenant-1', 'user_existing')).rejects.toThrow(/not found/i)
  })
})

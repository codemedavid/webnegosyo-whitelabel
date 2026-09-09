/**
 * Grant scope on the web staff service (src/lib/staff-service.ts).
 *
 * Mirrors `canGrantPermissions` in supabase/functions/manage-staff/staff-core.ts:
 * an owner, a superadmin, or a pre-staff-management admin (`permissions: null`)
 * may grant anything; everyone else may grant only what they hold. A branch
 * admin holding one permission must not be able to mint a full-access account
 * (H3), whether by creating it, re-permissioning it, or taking it over with a
 * password reset. The refusal is a clear error — never a silently trimmed grant.
 */
import {
  canGrantPermissions,
  createStaff,
  resetStaffPassword,
  updateStaffPermissions,
  type StaffBranchContext,
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

function staffRecord(overrides: Partial<StaffRecord> = {}): StaffRecord {
  return {
    user_id: 'user_existing',
    tenant_id: 'tenant-1',
    role: 'admin',
    is_owner: false,
    outlet_id: 'branch-a',
    permissions: ['orders'],
    display_name: 'Existing Staff',
    email: 'existing@example.com',
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

/** A branch admin of branch-a holding two permissions. */
const BRANCH_ADMIN: StaffBranchContext = {
  outlets: [{ id: 'branch-a' }, { id: 'branch-b' }],
  actor: { role: 'admin', is_owner: false, outlet_id: 'branch-a', permissions: ['branch_staff', 'orders'] },
}

const OWNER: StaffBranchContext = {
  outlets: [{ id: 'branch-a' }, { id: 'branch-b' }],
  actor: { role: 'admin', is_owner: true, permissions: null },
}

const GRANT_ERROR = /only grant permissions you hold/i

describe('canGrantPermissions', () => {
  it('lets an owner, a superadmin, or a pre-staff-management admin grant anything', () => {
    expect(canGrantPermissions({ role: 'admin', is_owner: true, permissions: ['orders'] }, ['analytics'])).toBe(true)
    expect(canGrantPermissions({ role: 'superadmin', is_owner: false, permissions: [] }, null)).toBe(true)
    expect(canGrantPermissions({ role: 'admin', is_owner: false, permissions: null }, ['analytics'])).toBe(true)
  })

  it('lets everyone else grant only a subset of what they hold', () => {
    const actor = { role: 'admin', is_owner: false, permissions: ['branch_staff', 'orders'] }
    expect(canGrantPermissions(actor, ['orders'])).toBe(true)
    expect(canGrantPermissions(actor, [])).toBe(true)
    expect(canGrantPermissions(actor, ['orders', 'analytics'])).toBe(false)
  })

  it('treats a full-access request (null) as grantable only by full-access callers', () => {
    expect(canGrantPermissions({ role: 'admin', is_owner: false, permissions: ['branch_staff', 'orders'] }, null)).toBe(false)
  })
})

describe('createStaff grant scope', () => {
  const input = {
    email: 'new.staff@example.com',
    password: 'supersecret1',
    displayName: 'New Staff',
    outletId: 'branch-a',
  }

  it('refuses a branch admin granting a permission it does not hold, before any account exists', async () => {
    const { store, state } = makeFakeStore()

    await expect(
      createStaff(store, 'tenant-1', { ...input, permissions: ['orders', 'analytics'] }, BRANCH_ADMIN)
    ).rejects.toThrow(GRANT_ERROR)

    expect(state.staff).toHaveLength(0)
    expect(state.authUsers.size).toBe(0)
  })

  it('never trims the request down to what the caller holds', async () => {
    const { store, state } = makeFakeStore()

    await expect(
      createStaff(store, 'tenant-1', { ...input, permissions: ['analytics'] }, BRANCH_ADMIN)
    ).rejects.toThrow(GRANT_ERROR)

    expect(state.staff).toHaveLength(0)
  })

  it('lets a branch admin grant a subset of its own permissions', async () => {
    const { store, state } = makeFakeStore()

    const created = await createStaff(store, 'tenant-1', { ...input, permissions: ['orders'] }, BRANCH_ADMIN)

    expect(created.permissions).toEqual(['orders'])
    expect(state.staff).toHaveLength(1)
  })

  it('lets the owner grant anything', async () => {
    const { store } = makeFakeStore()

    const created = await createStaff(store, 'tenant-1', { ...input, permissions: ['orders', 'analytics'] }, OWNER)

    expect(created.permissions).toEqual(['orders', 'analytics'])
  })

  it('leaves a single-location call with no actor exactly as it was', async () => {
    const { store } = makeFakeStore()

    const created = await createStaff(store, 'tenant-1', { ...input, outletId: undefined, permissions: ['analytics'] })

    expect(created.permissions).toEqual(['analytics'])
  })
})

describe('updateStaffPermissions grant scope', () => {
  it('refuses a branch admin widening an account beyond its own permissions, leaving the row untouched', async () => {
    const { store, state } = makeFakeStore([staffRecord()])

    await expect(
      updateStaffPermissions(store, 'tenant-1', 'user_existing', ['orders', 'analytics'], BRANCH_ADMIN)
    ).rejects.toThrow(GRANT_ERROR)

    expect(state.staff[0].permissions).toEqual(['orders'])
  })

  it('lets a branch admin set a subset of its own permissions', async () => {
    const { store, state } = makeFakeStore([staffRecord()])

    await updateStaffPermissions(store, 'tenant-1', 'user_existing', ['branch_staff'], BRANCH_ADMIN)

    expect(state.staff[0].permissions).toEqual(['branch_staff'])
  })
})

describe('resetStaffPassword grant scope', () => {
  it('refuses a branch admin taking over an account it could not have created', async () => {
    const { store, state } = makeFakeStore([staffRecord({ permissions: ['orders', 'analytics'] })])

    await expect(
      resetStaffPassword(store, 'tenant-1', 'user_existing', 'newsecret1', BRANCH_ADMIN)
    ).rejects.toThrow(GRANT_ERROR)

    expect(state.authUsers.get('user_existing')?.password).toBe('existing-pass')
  })

  it('refuses a branch admin taking over a full-access (permissions: null) account', async () => {
    const { store, state } = makeFakeStore([staffRecord({ permissions: null })])

    await expect(
      resetStaffPassword(store, 'tenant-1', 'user_existing', 'newsecret1', BRANCH_ADMIN)
    ).rejects.toThrow(GRANT_ERROR)

    expect(state.authUsers.get('user_existing')?.password).toBe('existing-pass')
  })

  it('lets a branch admin reset an account within its own permissions', async () => {
    const { store, state } = makeFakeStore([staffRecord({ permissions: ['orders'] })])

    await resetStaffPassword(store, 'tenant-1', 'user_existing', 'newsecret1', BRANCH_ADMIN)

    expect(state.authUsers.get('user_existing')?.password).toBe('newsecret1')
  })
})

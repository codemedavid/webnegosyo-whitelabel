/**
 * The manage-staff edge function's decision core.
 *
 * The merchant app cannot hold the service-role key, so staff management from
 * the phone goes through supabase/functions/manage-staff. Its core is a pure,
 * dependency-free port of src/lib/staff-service.ts and friends — these tests
 * pin the port to the web originals (parity blocks) and prove the dispatcher
 * enforces the same authorization the web server actions do.
 */
import {
  STAFF_PERMISSION_KEYS as CORE_PERMISSION_KEYS,
  DEFAULT_SCREEN_PERMISSIONS,
  handleStaffAction,
  type StaffCaller,
  type StaffCoreStore,
  type StaffRecord,
} from '../../supabase/functions/manage-staff/staff-core'
import { STAFF_PERMISSION_KEYS as WEB_PERMISSION_KEYS } from '@/lib/staff-permissions'
import { DEFAULT_SCREEN_OPTIONS } from '@/lib/staff-default-screen'
import { DEFAULT_MAX_STAFF_PER_BRANCH } from '@/lib/billing/plan'

// ============================================
// Fakes
// ============================================

interface FakeState {
  staff: StaffRecord[]
  authUsers: Set<string>
  passwords: Map<string, string>
  nextId: number
}

function makeFakeStore(initial: StaffRecord[] = []): {
  store: StaffCoreStore
  state: FakeState
} {
  const state: FakeState = {
    staff: [...initial],
    authUsers: new Set(initial.map((s) => s.user_id)),
    passwords: new Map(),
    nextId: 1,
  }
  const store: StaffCoreStore = {
    listStaff: async (tenantId) =>
      state.staff.filter((s) => s.tenant_id === tenantId),
    createAuthUser: async () => {
      const userId = `user-${state.nextId}`
      state.nextId += 1
      state.authUsers.add(userId)
      return { userId }
    },
    insertStaffRow: async (row) => {
      state.staff = [...state.staff, row]
    },
    updateStaffRow: async (userId, patch) => {
      state.staff = state.staff.map((s) =>
        s.user_id === userId ? { ...s, ...patch } : s
      )
    },
    deleteAuthUser: async (userId) => {
      state.authUsers.delete(userId)
      state.staff = state.staff.filter((s) => s.user_id !== userId)
    },
    updateAuthPassword: async (userId, password) => {
      state.passwords.set(userId, password)
    },
  }
  return { store, state }
}

const TENANT = 'tenant-1'
const OTHER_TENANT = 'tenant-2'
const BRANCH_A = 'outlet-a'
const BRANCH_B = 'outlet-b'

function record(overrides: Partial<StaffRecord>): StaffRecord {
  return {
    user_id: 'staff-x',
    tenant_id: TENANT,
    role: 'admin',
    is_owner: false,
    outlet_id: null,
    permissions: ['orders'],
    display_name: 'Staff',
    email: 'staff@example.com',
    default_tab: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const OWNER: StaffCaller = {
  user_id: 'owner-1',
  tenant_id: TENANT,
  role: 'admin',
  is_owner: true,
  outlet_id: null,
  permissions: null,
}

const BRANCH_ADMIN: StaffCaller = {
  user_id: 'badmin-1',
  tenant_id: TENANT,
  role: 'admin',
  is_owner: false,
  outlet_id: BRANCH_A,
  permissions: ['orders', 'branch_staff'],
}

const PLAIN_STAFF: StaffCaller = {
  user_id: 'plain-1',
  tenant_id: TENANT,
  role: 'admin',
  is_owner: false,
  outlet_id: null,
  permissions: ['orders', 'pos'],
}

const CONTEXT = { outlets: [{ id: BRANCH_A }, { id: BRANCH_B }] }

const CREATE_INPUT = {
  email: 'new@example.com',
  password: 'password123',
  displayName: 'New Staff',
  permissions: ['orders'],
}

// ============================================
// Registry parity with the web source of truth
// ============================================

describe('manage-staff core parity', () => {
  it('permission keys match src/lib/staff-permissions exactly, in order', () => {
    expect([...CORE_PERMISSION_KEYS]).toEqual([...WEB_PERMISSION_KEYS])
  })

  it('default-screen permission map matches src/lib/staff-default-screen', () => {
    const webMap = Object.fromEntries(
      DEFAULT_SCREEN_OPTIONS.map((o) => [o.tab, o.permission])
    )
    expect(DEFAULT_SCREEN_PERMISSIONS).toEqual(webMap)
  })
})

// ============================================
// Authorization
// ============================================

describe('handleStaffAction authorization', () => {
  it('refuses a caller with no staff-management authority', async () => {
    const { store } = makeFakeStore([record({ user_id: 's1' })])
    const result = await handleStaffAction(store, PLAIN_STAFF, CONTEXT, {
      action: 'list',
    })
    expect(result.status).toBe(403)
    expect(result.body.success).toBe(false)
  })

  it('refuses a non-admin role outright', async () => {
    const { store } = makeFakeStore()
    const result = await handleStaffAction(
      store,
      { ...OWNER, role: 'customer', is_owner: false },
      CONTEXT,
      { action: 'list' }
    )
    expect(result.status).toBe(403)
  })

  it('rejects an unknown action with 400', async () => {
    const { store } = makeFakeStore()
    const result = await handleStaffAction(store, OWNER, CONTEXT, {
      action: 'explode',
    } as never)
    expect(result.status).toBe(400)
    expect(result.body.success).toBe(false)
  })

  it('never reaches into another tenant even if a record id matches', async () => {
    const { store } = makeFakeStore([
      record({ user_id: 's1', tenant_id: OTHER_TENANT }),
    ])
    const result = await handleStaffAction(store, OWNER, CONTEXT, {
      action: 'remove',
      userId: 's1',
    })
    expect(result.status).toBe(400)
    expect(result.body.success).toBe(false)
  })
})

// ============================================
// list
// ============================================

describe('list', () => {
  it('owner sees every staff account in the tenant', async () => {
    const { store } = makeFakeStore([
      record({ user_id: 's1', outlet_id: BRANCH_A }),
      record({ user_id: 's2', outlet_id: BRANCH_B }),
      record({ user_id: 's3', tenant_id: OTHER_TENANT }),
    ])
    const result = await handleStaffAction(store, OWNER, CONTEXT, {
      action: 'list',
    })
    expect(result.status).toBe(200)
    const ids = (result.body.data as StaffRecord[]).map((s) => s.user_id)
    expect(ids).toEqual(['s1', 's2'])
  })

  it('branch admin sees only its own branch plus itself', async () => {
    const { store } = makeFakeStore([
      record({ user_id: BRANCH_ADMIN.user_id, outlet_id: BRANCH_A, permissions: ['orders', 'branch_staff'] }),
      record({ user_id: 's1', outlet_id: BRANCH_A }),
      record({ user_id: 's2', outlet_id: BRANCH_B }),
      record({ user_id: 's3', outlet_id: null }),
    ])
    const result = await handleStaffAction(store, BRANCH_ADMIN, CONTEXT, {
      action: 'list',
    })
    expect(result.status).toBe(200)
    const ids = (result.body.data as StaffRecord[]).map((s) => s.user_id)
    expect(ids).toEqual([BRANCH_ADMIN.user_id, 's1'])
  })
})

// ============================================
// create
// ============================================

describe('create', () => {
  it('owner creates a staff account with validated fields', async () => {
    const { store, state } = makeFakeStore()
    const result = await handleStaffAction(store, OWNER, CONTEXT, {
      action: 'create',
      input: {
        ...CREATE_INPUT,
        email: '  New@Example.com ',
        outletId: BRANCH_A,
        defaultTab: 'orders',
      },
    })
    expect(result.status).toBe(200)
    expect(state.staff).toHaveLength(1)
    const created = state.staff[0]
    expect(created.email).toBe('new@example.com')
    expect(created.tenant_id).toBe(TENANT)
    expect(created.role).toBe('admin')
    expect(created.is_owner).toBe(false)
    expect(created.outlet_id).toBe(BRANCH_A)
    expect(created.permissions).toEqual(['orders'])
    expect(created.default_tab).toBe('orders')
  })

  it('drops a pinned screen the granted permissions do not cover', async () => {
    const { store, state } = makeFakeStore()
    const result = await handleStaffAction(store, OWNER, CONTEXT, {
      action: 'create',
      input: { ...CREATE_INPUT, defaultTab: 'pos' },
    })
    expect(result.status).toBe(200)
    expect(state.staff[0].default_tab).toBeNull()
  })

  it.each([
    ['bad email', { ...CREATE_INPUT, email: 'nope' }],
    ['short password', { ...CREATE_INPUT, password: 'short' }],
    ['blank display name', { ...CREATE_INPUT, displayName: '   ' }],
    ['unknown permission', { ...CREATE_INPUT, permissions: ['hack'] }],
    ['empty permissions', { ...CREATE_INPUT, permissions: [] }],
    ['unknown branch', { ...CREATE_INPUT, outletId: 'outlet-nope' }],
  ])('refuses invalid input: %s', async (_label, input) => {
    const { store, state } = makeFakeStore()
    const result = await handleStaffAction(store, OWNER, CONTEXT, {
      action: 'create',
      input,
    })
    expect(result.status).toBe(400)
    expect(state.staff).toHaveLength(0)
  })

  it('enforces the default per-branch staff cap', async () => {
    const existing = Array.from({ length: DEFAULT_MAX_STAFF_PER_BRANCH }, (_, i) =>
      record({ user_id: `s${i}`, outlet_id: BRANCH_A })
    )
    const { store } = makeFakeStore(existing)
    const result = await handleStaffAction(store, OWNER, CONTEXT, {
      action: 'create',
      input: { ...CREATE_INPUT, outletId: BRANCH_A },
    })
    expect(result.status).toBe(400)
  })

  it('honours a raised per-branch allowance from the tenant plan', async () => {
    const existing = Array.from({ length: DEFAULT_MAX_STAFF_PER_BRANCH }, (_, i) =>
      record({ user_id: `s${i}`, outlet_id: BRANCH_A })
    )
    const { store, state } = makeFakeStore(existing)
    const result = await handleStaffAction(
      store,
      OWNER,
      { ...CONTEXT, maxStaffPerBranch: DEFAULT_MAX_STAFF_PER_BRANCH + 1 },
      { action: 'create', input: { ...CREATE_INPUT, outletId: BRANCH_A } }
    )
    expect(result.status).toBe(200)
    expect(state.staff).toHaveLength(DEFAULT_MAX_STAFF_PER_BRANCH + 1)
  })

  it('branch admin may create only into its own branch', async () => {
    const { store, state } = makeFakeStore()
    const denied = await handleStaffAction(store, BRANCH_ADMIN, CONTEXT, {
      action: 'create',
      input: { ...CREATE_INPUT }, // no outlet = store-wide, above its authority
    })
    expect(denied.status).toBe(400)
    expect(state.staff).toHaveLength(0)

    const allowed = await handleStaffAction(store, BRANCH_ADMIN, CONTEXT, {
      action: 'create',
      input: { ...CREATE_INPUT, outletId: BRANCH_A },
    })
    expect(allowed.status).toBe(200)
    expect(state.staff[0].outlet_id).toBe(BRANCH_A)
  })
})

// ============================================
// update_permissions
// ============================================

describe('update_permissions', () => {
  it('replaces the permission list and clears a now-uncovered pinned screen', async () => {
    const { store, state } = makeFakeStore([
      record({ user_id: 's1', permissions: ['pos'], default_tab: 'pos' }),
    ])
    const result = await handleStaffAction(store, OWNER, CONTEXT, {
      action: 'update_permissions',
      userId: 's1',
      permissions: ['orders'],
    })
    expect(result.status).toBe(200)
    expect(state.staff[0].permissions).toEqual(['orders'])
    expect(state.staff[0].default_tab).toBeNull()
  })

  it('refuses to modify the owner account', async () => {
    const { store } = makeFakeStore([
      record({ user_id: 'owner-1', is_owner: true }),
    ])
    const result = await handleStaffAction(store, OWNER, CONTEXT, {
      action: 'update_permissions',
      userId: 'owner-1',
      permissions: ['orders'],
    })
    expect(result.status).toBe(400)
  })

  it("branch admin cannot touch another branch's account", async () => {
    const { store, state } = makeFakeStore([
      record({ user_id: 's2', outlet_id: BRANCH_B, permissions: ['pos'] }),
    ])
    const result = await handleStaffAction(store, BRANCH_ADMIN, CONTEXT, {
      action: 'update_permissions',
      userId: 's2',
      permissions: ['orders'],
    })
    expect(result.status).toBe(400)
    expect(state.staff[0].permissions).toEqual(['pos'])
  })
})

// ============================================
// update_branch
// ============================================

describe('update_branch', () => {
  it('owner moves an account between branches, capped at the target', async () => {
    const full = Array.from({ length: DEFAULT_MAX_STAFF_PER_BRANCH }, (_, i) =>
      record({ user_id: `b${i}`, outlet_id: BRANCH_B })
    )
    const { store, state } = makeFakeStore([
      record({ user_id: 's1', outlet_id: BRANCH_A }),
      ...full,
    ])
    const blocked = await handleStaffAction(store, OWNER, CONTEXT, {
      action: 'update_branch',
      userId: 's1',
      outletId: BRANCH_B,
    })
    expect(blocked.status).toBe(400)

    const widened = await handleStaffAction(store, OWNER, CONTEXT, {
      action: 'update_branch',
      userId: 's1',
      outletId: null,
    })
    expect(widened.status).toBe(200)
    expect(state.staff.find((s) => s.user_id === 's1')?.outlet_id).toBeNull()
  })

  it('branch admin cannot move its staff onto another branch', async () => {
    const { store } = makeFakeStore([
      record({ user_id: 's1', outlet_id: BRANCH_A }),
    ])
    const result = await handleStaffAction(store, BRANCH_ADMIN, CONTEXT, {
      action: 'update_branch',
      userId: 's1',
      outletId: BRANCH_B,
    })
    expect(result.status).toBe(400)
  })
})

// ============================================
// update_default_screen / reset_password / remove
// ============================================

describe('update_default_screen', () => {
  it('pins a covered screen and nulls an uncovered one', async () => {
    const { store, state } = makeFakeStore([
      record({ user_id: 's1', permissions: ['orders'] }),
    ])
    const pin = await handleStaffAction(store, OWNER, CONTEXT, {
      action: 'update_default_screen',
      userId: 's1',
      defaultTab: 'orders',
    })
    expect(pin.status).toBe(200)
    expect(state.staff[0].default_tab).toBe('orders')

    const uncovered = await handleStaffAction(store, OWNER, CONTEXT, {
      action: 'update_default_screen',
      userId: 's1',
      defaultTab: 'pos',
    })
    expect(uncovered.status).toBe(200)
    expect(state.staff[0].default_tab).toBeNull()
  })
})

describe('reset_password', () => {
  it('sets a new password of valid length', async () => {
    const { store, state } = makeFakeStore([record({ user_id: 's1' })])
    const result = await handleStaffAction(store, OWNER, CONTEXT, {
      action: 'reset_password',
      userId: 's1',
      newPassword: 'newpassword1',
    })
    expect(result.status).toBe(200)
    expect(state.passwords.get('s1')).toBe('newpassword1')
  })

  it('refuses a short password and the owner account', async () => {
    const { store, state } = makeFakeStore([
      record({ user_id: 's1' }),
      record({ user_id: 'owner-1', is_owner: true }),
    ])
    const short = await handleStaffAction(store, OWNER, CONTEXT, {
      action: 'reset_password',
      userId: 's1',
      newPassword: 'short',
    })
    expect(short.status).toBe(400)
    const owner = await handleStaffAction(store, OWNER, CONTEXT, {
      action: 'reset_password',
      userId: 'owner-1',
      newPassword: 'newpassword1',
    })
    expect(owner.status).toBe(400)
    expect(state.passwords.size).toBe(0)
  })
})

describe('remove', () => {
  it('owner removes a staff account (auth user deleted)', async () => {
    const { store, state } = makeFakeStore([record({ user_id: 's1' })])
    const result = await handleStaffAction(store, OWNER, CONTEXT, {
      action: 'remove',
      userId: 's1',
    })
    expect(result.status).toBe(200)
    expect(state.authUsers.has('s1')).toBe(false)
    expect(state.staff).toHaveLength(0)
  })

  it('never removes the owner', async () => {
    const { store, state } = makeFakeStore([
      record({ user_id: 'owner-1', is_owner: true }),
    ])
    const result = await handleStaffAction(store, OWNER, CONTEXT, {
      action: 'remove',
      userId: 'owner-1',
    })
    expect(result.status).toBe(400)
    expect(state.staff).toHaveLength(1)
  })

  it("branch admin cannot remove another branch's account", async () => {
    const { store, state } = makeFakeStore([
      record({ user_id: 's2', outlet_id: BRANCH_B }),
    ])
    const result = await handleStaffAction(store, BRANCH_ADMIN, CONTEXT, {
      action: 'remove',
      userId: 's2',
    })
    expect(result.status).toBe(400)
    expect(state.staff).toHaveLength(1)
  })
})

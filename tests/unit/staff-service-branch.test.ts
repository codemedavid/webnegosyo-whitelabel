import {
  createStaff,
  removeStaff,
  resetStaffPassword,
  updateStaffBranch,
  updateStaffPermissions,
  type StaffRecord,
  type StaffStore,
} from '@/lib/staff-service'

/**
 * Creating and moving staff once a store has branches.
 *
 * Two rules matter here. A branch account may only be created against a branch
 * the store actually owns — an id from elsewhere would produce an account
 * reading another merchant's orders. And the three-account cap now applies per
 * branch: counting it store-wide would leave a five-branch business sharing
 * three logins, which is the same as not shipping the feature.
 *
 * A store with no branches passes no branch and behaves exactly as it does
 * today; those paths stay covered by staff-service.test.ts.
 */

const OUTLETS = [{ id: 'outlet-north' }, { id: 'outlet-south' }]

function makeFakeStore(initialStaff: StaffRecord[] = []): {
  store: StaffStore
  read: () => StaffRecord[]
} {
  let staff = [...initialStaff]
  let nextId = 1

  const store: StaffStore = {
    listStaff: async (tenantId) => staff.filter((s) => s.tenant_id === tenantId),
    createAuthUser: async () => ({ userId: `user_${nextId++}` }),
    insertStaffRow: async (row) => {
      staff = [...staff, row]
    },
    updateStaffRow: async (userId, patch) => {
      staff = staff.map((s) => (s.user_id === userId ? { ...s, ...patch } : s))
    },
    deleteAuthUser: async (userId) => {
      staff = staff.filter((s) => s.user_id !== userId)
    },
    updateAuthPassword: async () => {},
  }

  return { store, read: () => staff }
}

function makeStaffRecord(overrides: Partial<StaffRecord> = {}): StaffRecord {
  return {
    user_id: `user_${Math.random().toString(36).slice(2)}`,
    tenant_id: 'tenant-1',
    role: 'admin',
    is_owner: false,
    outlet_id: null,
    permissions: ['orders'],
    display_name: 'Existing Staff',
    email: 'existing@example.com',
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

const baseInput = {
  email: 'new.staff@example.com',
  password: 'supersecret1',
  displayName: 'New Staff',
  permissions: ['orders'],
}

const owner = { role: 'admin', is_owner: true, outlet_id: null }
const northAdmin = {
  role: 'admin',
  is_owner: false,
  outlet_id: 'outlet-north',
  permissions: ['orders', 'branch_staff'],
}

describe('createStaff with a branch', () => {
  it('records the branch on the new account', async () => {
    const { store, read } = makeFakeStore()

    const created = await createStaff(
      store,
      'tenant-1',
      { ...baseInput, outletId: 'outlet-north' },
      { outlets: OUTLETS, actor: owner }
    )

    expect(created.outlet_id).toBe('outlet-north')
    expect(read()[0].outlet_id).toBe('outlet-north')
  })

  it('creates a store-wide account when no branch is given', async () => {
    const { store } = makeFakeStore()

    const created = await createStaff(store, 'tenant-1', baseInput, {
      outlets: OUTLETS,
      actor: owner,
    })

    expect(created.outlet_id).toBeNull()
  })

  it('treats the empty "All branches" option as store-wide', async () => {
    const { store } = makeFakeStore()

    const created = await createStaff(
      store,
      'tenant-1',
      { ...baseInput, outletId: '' },
      { outlets: OUTLETS, actor: owner }
    )

    expect(created.outlet_id).toBeNull()
  })

  it("refuses a branch the store does not own", async () => {
    const { store, read } = makeFakeStore()

    await expect(
      createStaff(
        store,
        'tenant-1',
        { ...baseInput, outletId: 'outlet-elsewhere' },
        { outlets: OUTLETS, actor: owner }
      )
    ).rejects.toThrow(/branch/i)
    // No half-created account: the auth user must not outlive the failure.
    expect(read()).toHaveLength(0)
  })

  it('lets a branch admin create staff at its own branch', async () => {
    const { store } = makeFakeStore()

    const created = await createStaff(
      store,
      'tenant-1',
      { ...baseInput, outletId: 'outlet-north' },
      { outlets: OUTLETS, actor: northAdmin }
    )

    expect(created.outlet_id).toBe('outlet-north')
  })

  it("refuses a branch admin creating staff at another branch", async () => {
    const { store } = makeFakeStore()

    await expect(
      createStaff(
        store,
        'tenant-1',
        { ...baseInput, outletId: 'outlet-south' },
        { outlets: OUTLETS, actor: northAdmin }
      )
    ).rejects.toThrow(/permission|allowed|cannot/i)
  })

  it('refuses a branch admin creating a store-wide account', async () => {
    const { store } = makeFakeStore()

    await expect(
      createStaff(store, 'tenant-1', baseInput, { outlets: OUTLETS, actor: northAdmin })
    ).rejects.toThrow(/permission|allowed|cannot/i)
  })
})

describe('staff limit per branch', () => {
  const threeAt = (outletId: string | null) => [
    makeStaffRecord({ user_id: 'a', outlet_id: outletId }),
    makeStaffRecord({ user_id: 'b', outlet_id: outletId }),
    makeStaffRecord({ user_id: 'c', outlet_id: outletId }),
  ]

  it('rejects a fourth account at the same branch', async () => {
    const { store } = makeFakeStore(threeAt('outlet-north'))

    await expect(
      createStaff(
        store,
        'tenant-1',
        { ...baseInput, outletId: 'outlet-north' },
        { outlets: OUTLETS, actor: owner }
      )
    ).rejects.toThrow(/maximum|limit/i)
  })

  it('allows an account at a different branch when one branch is full', async () => {
    const { store } = makeFakeStore(threeAt('outlet-north'))

    const created = await createStaff(
      store,
      'tenant-1',
      { ...baseInput, outletId: 'outlet-south' },
      { outlets: OUTLETS, actor: owner }
    )

    expect(created.outlet_id).toBe('outlet-south')
  })

  it('allows a store-wide account when one branch is full', async () => {
    const { store } = makeFakeStore(threeAt('outlet-north'))

    const created = await createStaff(store, 'tenant-1', baseInput, {
      outlets: OUTLETS,
      actor: owner,
    })

    expect(created.outlet_id).toBeNull()
  })

  it('still caps store-wide accounts at three', async () => {
    const { store } = makeFakeStore(threeAt(null))

    await expect(
      createStaff(store, 'tenant-1', baseInput, { outlets: OUTLETS, actor: owner })
    ).rejects.toThrow(/maximum|limit/i)
  })

  it('does not count the owner against a branch', async () => {
    const { store } = makeFakeStore([
      makeStaffRecord({ user_id: 'owner', is_owner: true, outlet_id: null }),
      makeStaffRecord({ user_id: 'a', outlet_id: 'outlet-north' }),
      makeStaffRecord({ user_id: 'b', outlet_id: 'outlet-north' }),
    ])

    const created = await createStaff(
      store,
      'tenant-1',
      { ...baseInput, outletId: 'outlet-north' },
      { outlets: OUTLETS, actor: owner }
    )

    expect(created.outlet_id).toBe('outlet-north')
  })
})

describe('updateStaffBranch', () => {
  it('moves a staff account to another branch', async () => {
    const { store, read } = makeFakeStore([
      makeStaffRecord({ user_id: 'a', outlet_id: 'outlet-north' }),
    ])

    await updateStaffBranch(store, 'tenant-1', 'a', 'outlet-south', {
      outlets: OUTLETS,
      actor: owner,
    })

    expect(read()[0].outlet_id).toBe('outlet-south')
  })

  it('widens a branch account to the whole store', async () => {
    const { store, read } = makeFakeStore([
      makeStaffRecord({ user_id: 'a', outlet_id: 'outlet-north' }),
    ])

    await updateStaffBranch(store, 'tenant-1', 'a', null, { outlets: OUTLETS, actor: owner })

    expect(read()[0].outlet_id).toBeNull()
  })

  it('refuses to move the owner', async () => {
    const { store } = makeFakeStore([makeStaffRecord({ user_id: 'a', is_owner: true })])

    await expect(
      updateStaffBranch(store, 'tenant-1', 'a', 'outlet-north', {
        outlets: OUTLETS,
        actor: owner,
      })
    ).rejects.toThrow(/owner/i)
  })

  it("refuses a branch admin moving staff out of its own branch", async () => {
    const { store } = makeFakeStore([
      makeStaffRecord({ user_id: 'a', outlet_id: 'outlet-north' }),
    ])

    await expect(
      updateStaffBranch(store, 'tenant-1', 'a', 'outlet-south', {
        outlets: OUTLETS,
        actor: northAdmin,
      })
    ).rejects.toThrow(/permission|allowed|cannot/i)
  })

  it("refuses a branch admin moving another branch's staff in", async () => {
    const { store } = makeFakeStore([
      makeStaffRecord({ user_id: 'a', outlet_id: 'outlet-south' }),
    ])

    await expect(
      updateStaffBranch(store, 'tenant-1', 'a', 'outlet-north', {
        outlets: OUTLETS,
        actor: northAdmin,
      })
    ).rejects.toThrow(/permission|allowed|cannot/i)
  })

  it('refuses an account belonging to another store', async () => {
    const { store } = makeFakeStore([
      makeStaffRecord({ user_id: 'a', tenant_id: 'tenant-2', outlet_id: null }),
    ])

    await expect(
      updateStaffBranch(store, 'tenant-1', 'a', 'outlet-north', {
        outlets: OUTLETS,
        actor: owner,
      })
    ).rejects.toThrow(/not found/i)
  })

  it('enforces the branch cap when moving into a full branch', async () => {
    const { store } = makeFakeStore([
      makeStaffRecord({ user_id: 'a', outlet_id: null }),
      makeStaffRecord({ user_id: 'b', outlet_id: 'outlet-north' }),
      makeStaffRecord({ user_id: 'c', outlet_id: 'outlet-north' }),
      makeStaffRecord({ user_id: 'd', outlet_id: 'outlet-north' }),
    ])

    await expect(
      updateStaffBranch(store, 'tenant-1', 'a', 'outlet-north', {
        outlets: OUTLETS,
        actor: owner,
      })
    ).rejects.toThrow(/maximum|limit/i)
  })
})

/**
 * A branch admin that can create accounts but not edit or remove them would be
 * half a feature — the owner would still have to clean up after every branch.
 * The same branch check therefore guards every write, not just creation.
 */
describe('managing an existing account across branches', () => {
  const northStaff = () => [makeStaffRecord({ user_id: 'a', outlet_id: 'outlet-north' })]
  const southStaff = () => [makeStaffRecord({ user_id: 'a', outlet_id: 'outlet-south' })]
  const context = { outlets: OUTLETS, actor: northAdmin }

  it('lets a branch admin change permissions for its own branch', async () => {
    const { store, read } = makeFakeStore(northStaff())

    await updateStaffPermissions(store, 'tenant-1', 'a', ['orders', 'menu'], context)

    expect(read()[0].permissions).toEqual(['orders', 'menu'])
  })

  it("refuses a branch admin changing another branch's permissions", async () => {
    const { store } = makeFakeStore(southStaff())

    await expect(
      updateStaffPermissions(store, 'tenant-1', 'a', ['orders'], context)
    ).rejects.toThrow(/permission|allowed|cannot/i)
  })

  it('lets a branch admin reset a password at its own branch', async () => {
    const { store } = makeFakeStore(northStaff())

    await expect(
      resetStaffPassword(store, 'tenant-1', 'a', 'supersecret1', context)
    ).resolves.toBeUndefined()
  })

  it("refuses a branch admin resetting another branch's password", async () => {
    const { store } = makeFakeStore(southStaff())

    await expect(
      resetStaffPassword(store, 'tenant-1', 'a', 'supersecret1', context)
    ).rejects.toThrow(/permission|allowed|cannot/i)
  })

  it('lets a branch admin remove its own branch staff', async () => {
    const { store, read } = makeFakeStore(northStaff())

    await removeStaff(store, 'tenant-1', 'a', context)

    expect(read()).toHaveLength(0)
  })

  it("refuses a branch admin removing another branch's staff", async () => {
    const { store, read } = makeFakeStore(southStaff())

    await expect(removeStaff(store, 'tenant-1', 'a', context)).rejects.toThrow(
      /permission|allowed|cannot/i
    )
    expect(read()).toHaveLength(1)
  })

  it('refuses a branch admin acting on a store-wide account', async () => {
    const { store } = makeFakeStore([makeStaffRecord({ user_id: 'a', outlet_id: null })])

    await expect(removeStaff(store, 'tenant-1', 'a', context)).rejects.toThrow(
      /permission|allowed|cannot/i
    )
  })

  it('lets the owner act on any branch', async () => {
    const { store, read } = makeFakeStore(southStaff())

    await removeStaff(store, 'tenant-1', 'a', { outlets: OUTLETS, actor: owner })

    expect(read()).toHaveLength(0)
  })
})

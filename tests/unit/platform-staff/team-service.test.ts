import {
  createTeamMember,
  removeTeamMember,
  resetTeamMemberPassword,
  updateTeamMember,
  type TeamMemberRow,
  type TeamStore,
} from '@/lib/platform-staff/team-service'

const STAFF_ID = '11111111-1111-4111-8111-111111111111'
const SUPER_ID = '22222222-2222-4222-8222-222222222222'
const ADMIN_ID = '33333333-3333-4333-8333-333333333333'

function makeStore(roles: Record<string, string> = {}) {
  const calls: string[] = []
  const inserted: TeamMemberRow[] = []
  const patches: Array<{ userId: string; patch: Partial<TeamMemberRow> }> = []
  const store: TeamStore = {
    listMembers: async () => [],
    findRole: async (userId) => roles[userId] ?? null,
    createAuthUser: async (email) => {
      calls.push(`createAuthUser:${email}`)
      return { id: STAFF_ID }
    },
    deleteAuthUser: async (id) => {
      calls.push(`deleteAuthUser:${id}`)
    },
    insertMember: async (row) => {
      calls.push('insertMember')
      inserted.push(row)
    },
    updateMember: async (userId, patch) => {
      patches.push({ userId, patch })
    },
    setPassword: async (userId) => {
      calls.push(`setPassword:${userId}`)
    },
  }
  return { store, calls, inserted, patches }
}

const VALID = {
  email: 'Ops@Example.com ',
  password: 'correct-horse',
  display_name: 'Ops Team',
  platform_permissions: ['tenants.edit', 'stores.view'],
  store_features: ['menu'],
}

describe('createTeamMember', () => {
  it('creates a platform_staff row with normalized grants', async () => {
    const { store, inserted } = makeStore()

    const member = await createTeamMember(store, VALID)

    expect(member.user_id).toBe(STAFF_ID)
    expect(inserted[0]).toMatchObject({
      user_id: STAFF_ID,
      role: 'platform_staff',
      tenant_id: null,
      is_owner: false,
      email: 'ops@example.com',
      display_name: 'Ops Team',
      platform_permissions: ['tenants.view', 'tenants.edit', 'stores.view'],
      permissions: ['menu'],
    })
  })

  it('drops the store-feature list when no store-dashboard grant is given', async () => {
    const { store, inserted } = makeStore()

    await createTeamMember(store, { ...VALID, platform_permissions: ['leads.view'], store_features: ['menu'] })

    expect(inserted[0].permissions).toBeNull()
  })

  it('keeps null store features as "every feature"', async () => {
    const { store, inserted } = makeStore()

    await createTeamMember(store, { ...VALID, store_features: null })

    expect(inserted[0].permissions).toBeNull()
  })

  it('rejects bad input before creating any login', async () => {
    const { store, calls } = makeStore()

    await expect(createTeamMember(store, { ...VALID, password: 'short' })).rejects.toThrow(/8 characters/)
    await expect(createTeamMember(store, { ...VALID, email: 'nope' })).rejects.toThrow(/email/i)
    await expect(createTeamMember(store, { ...VALID, platform_permissions: [] })).rejects.toThrow(/at least one/)
    await expect(createTeamMember(store, { ...VALID, store_features: ['bogus'] })).rejects.toThrow(/Unknown permission/)
    expect(calls).toEqual([])
  })

  it('removes the login again when the app_users row cannot be written', async () => {
    const { store, calls } = makeStore()
    store.insertMember = async () => {
      throw new Error('insert failed')
    }

    await expect(createTeamMember(store, VALID)).rejects.toThrow('insert failed')
    expect(calls).toContain(`deleteAuthUser:${STAFF_ID}`)
  })
})

describe('updateTeamMember', () => {
  it('rewrites grants for platform staff', async () => {
    const { store, patches } = makeStore({ [STAFF_ID]: 'platform_staff' })

    await updateTeamMember(store, {
      user_id: STAFF_ID,
      display_name: 'Renamed',
      platform_permissions: ['subscriptions.edit'],
      store_features: null,
    })

    expect(patches).toEqual([
      {
        userId: STAFF_ID,
        patch: {
          display_name: 'Renamed',
          platform_permissions: ['subscriptions.view', 'subscriptions.edit'],
          permissions: null,
        },
      },
    ])
  })

  it.each([
    [SUPER_ID, 'superadmin'],
    [ADMIN_ID, 'admin'],
  ])('refuses to touch a %s row', async (userId, role) => {
    const { store, patches } = makeStore({ [userId]: role })

    await expect(
      updateTeamMember(store, { user_id: userId, display_name: 'x', platform_permissions: ['leads.view'], store_features: null })
    ).rejects.toThrow(/not a team member/)
    expect(patches).toEqual([])
  })
})

describe('removeTeamMember', () => {
  it('deletes the login of a platform staff account', async () => {
    const { store, calls } = makeStore({ [STAFF_ID]: 'platform_staff' })

    await removeTeamMember(store, STAFF_ID)

    expect(calls).toEqual([`deleteAuthUser:${STAFF_ID}`])
  })

  it('never deletes a superadmin or a store admin', async () => {
    const { store, calls } = makeStore({ [SUPER_ID]: 'superadmin', [ADMIN_ID]: 'admin' })

    await expect(removeTeamMember(store, SUPER_ID)).rejects.toThrow(/not a team member/)
    await expect(removeTeamMember(store, ADMIN_ID)).rejects.toThrow(/not a team member/)
    expect(calls).toEqual([])
  })
})

describe('resetTeamMemberPassword', () => {
  it('sets a new password for platform staff only', async () => {
    const { store, calls } = makeStore({ [STAFF_ID]: 'platform_staff', [SUPER_ID]: 'superadmin' })

    await resetTeamMemberPassword(store, { user_id: STAFF_ID, password: 'another-secret' })
    await expect(
      resetTeamMemberPassword(store, { user_id: SUPER_ID, password: 'another-secret' })
    ).rejects.toThrow(/not a team member/)
    await expect(
      resetTeamMemberPassword(store, { user_id: STAFF_ID, password: 'short' })
    ).rejects.toThrow(/8 characters/)

    expect(calls).toEqual([`setPassword:${STAFF_ID}`])
  })
})

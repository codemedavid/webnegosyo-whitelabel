/**
 * Removing a store account from the superadmin panel.
 *
 * The only RLS policy on `app_users` is "read your own row", so a DELETE sent
 * through the request-scoped client matches nothing and returns success with
 * zero rows. That read as "User not found for this tenant" while the account
 * stayed put and reappeared on the next refresh. Every other write in this
 * action file already goes through the service-role client; these lock the
 * removal and role update to it too.
 */

const mockRevalidatePath = jest.fn()
jest.mock('next/cache', () => ({ revalidatePath: (path: string) => mockRevalidatePath(path) }))

interface TableResult {
  data: unknown
  error: { message: string } | null
}

/** A `from(...)` chain that records the write it was asked to perform. */
function makeClient(result: TableResult, log: string[], label: string) {
  const builder = {
    delete: () => {
      log.push(`${label}:delete`)
      return builder
    },
    update: (patch: unknown) => {
      log.push(`${label}:update:${JSON.stringify(patch)}`)
      return builder
    },
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    maybeSingle: () => Promise.resolve({ data: { role: 'superadmin' }, error: null }),
    then: (resolve: (value: TableResult) => unknown) => resolve(result),
  }

  return {
    from: () => builder,
    auth: {
      getUser: async () => ({ data: { user: { id: 'superadmin_1' } } }),
      admin: {
        deleteUser: jest.fn(async () => ({ error: null })),
        getUserById: jest.fn(async () => ({ data: { user: null } })),
      },
    },
  }
}

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'

const OWNER_ROW = {
  user_id: USER_ID,
  role: 'admin',
  is_owner: true,
  tenant_id: TENANT_ID,
  outlet_id: null,
}

/**
 * `jest.mock` is not hoisted above the static imports next/jest emits, so the
 * action module is required lazily once the clients are in place.
 */
function loadAction(rlsResult: TableResult, adminResult: TableResult) {
  const log: string[] = []
  jest.resetModules()
  jest.doMock('@/lib/supabase/server', () => ({
    createClient: async () => makeClient(rlsResult, log, 'rls'),
  }))
  jest.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: () => makeClient(adminResult, log, 'admin'),
  }))

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const actions = require('@/actions/users') as typeof import('@/actions/users')
  return { actions, log }
}

const BLOCKED: TableResult = { data: [], error: null }

describe('removeTenantUser', () => {
  beforeEach(() => {
    mockRevalidatePath.mockClear()
  })

  it('removes the account through the service-role client, not the RLS one', async () => {
    const { actions, log } = loadAction(BLOCKED, { data: [OWNER_ROW], error: null })

    const result = await actions.removeTenantUser(USER_ID, TENANT_ID)

    expect(result).toEqual({ success: true })
    expect(log).toContain('admin:delete')
    expect(log).not.toContain('rls:delete')
  })

  it('still reports a genuinely absent account', async () => {
    const { actions } = loadAction(BLOCKED, { data: [], error: null })

    const result = await actions.removeTenantUser(USER_ID, TENANT_ID)

    expect(result).toEqual({ error: 'User not found for this tenant' })
  })
})

describe('updateTenantUser', () => {
  it('writes the role change through the service-role client', async () => {
    const { actions, log } = loadAction(BLOCKED, { data: [OWNER_ROW], error: null })

    const result = await actions.updateTenantUser({
      user_id: USER_ID,
      role: 'admin',
      tenant_id: TENANT_ID,
    })

    expect(result).toEqual({ success: true })
    expect(log.some((entry) => entry.startsWith('admin:update'))).toBe(true)
    expect(log.some((entry) => entry.startsWith('rls:update'))).toBe(false)
  })
})

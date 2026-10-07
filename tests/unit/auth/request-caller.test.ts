/**
 * request-caller is the ONE identity read an admin render makes. The layout and
 * every verifyTenantAdmin beneath it share it, so its contract is the contract
 * all of them used to implement separately: GoTrue decides who you are (a
 * refused session is anonymous, never a half-user), and the app_users read
 * failing is reported, not mistaken for "no admin record".
 */

const getUser = jest.fn()
const fetchAppUserScope = jest.fn()
const fetchSubscription = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ auth: { getUser } }),
}))

jest.mock('@/lib/queries/fetch-app-user-scope', () => ({
  asAppUserQueryClient: (client: unknown) => client,
  fetchAppUserScope: (...args: unknown[]) => fetchAppUserScope(...args),
}))

jest.mock('@/lib/billing/subscription-repository', () => ({
  fetchSubscription: (...args: unknown[]) => fetchSubscription(...args),
}))

// Lazy import: next/jest's SWC transform does not hoist jest.mock above static
// imports (see tests that load the module under test inside each test).
async function load() {
  return import('@/lib/auth/request-caller')
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getRequestCaller', () => {
  test('reads as anonymous when GoTrue refuses the session, without touching app_users', async () => {
    // Arrange
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'JWT expired' } })
    const { getRequestCaller } = await load()

    // Act
    const caller = await getRequestCaller()

    // Assert
    expect(caller).toEqual({ user: null, appUser: null, roleError: null })
    expect(fetchAppUserScope).not.toHaveBeenCalled()
  })

  test('returns the verified user with their app_users row', async () => {
    const user = { id: 'u1' }
    const appUser = { role: 'admin', tenant_id: 't1', is_owner: true, permissions: null }
    getUser.mockResolvedValue({ data: { user }, error: null })
    fetchAppUserScope.mockResolvedValue({ appUser, isDegraded: false, error: null })
    const { getRequestCaller } = await load()

    const caller = await getRequestCaller()

    expect(caller).toEqual({ user, appUser, roleError: null })
    expect(fetchAppUserScope).toHaveBeenCalledWith(expect.anything(), 'u1')
  })

  test('surfaces a failed app_users read as an error, not as a missing record', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    fetchAppUserScope.mockResolvedValue({ appUser: null, isDegraded: false, error: 'timeout' })
    const { getRequestCaller } = await load()

    const caller = await getRequestCaller()

    expect(caller.roleError).toBe('timeout')
    expect(caller.appUser).toBeNull()
  })
})

describe('getRequestSubscription', () => {
  test('passes the tenant through and keeps fetchSubscription fail-open null', async () => {
    fetchSubscription.mockResolvedValue(null)
    const { getRequestSubscription } = await load()

    await expect(getRequestSubscription('t1')).resolves.toBeNull()
    expect(fetchSubscription).toHaveBeenCalledWith(expect.anything(), 't1')
  })
})

// A module, not a script: keeps this file's lazy `load` helper out of the global scope.
export {}

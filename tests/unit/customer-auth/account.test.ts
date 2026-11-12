/** @jest-environment node */
jest.mock('server-only', () => ({}))
export {}

const rpc = jest.fn()
const rows: Record<string, { data: unknown; error: unknown }> = {}
const chain = (table: string) => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    update: () => builder,
    maybeSingle: async () => rows[table],
    then: (resolve: (value: unknown) => void) => resolve(rows[`${table}:update`]),
  }
  return builder
}
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc, from: chain }), ADMIN_QUERY_TIMEOUT_MS: 8000 }))

const TENANT = '00000000-0000-4000-8000-000000000001'
const CUSTOMER = '77777777-7777-4777-8777-777777777777'
const load = async () => ({ ...(await import('@/lib/customer-auth/account')), tokens: await import('@/lib/customer-auth/session-token') })
const headers = (value: string | null) => ({ get: (name: string) => (name === 'authorization' ? value : null) })

beforeEach(() => jest.clearAllMocks())

describe('resolveCustomerSession', () => {
  it('asks the database for this store only and returns the customer', async () => {
    const { resolveCustomerSession, tokens } = await load()
    const { token, tokenHash } = tokens.createAppSessionToken()
    rpc.mockResolvedValue({ data: { ok: true, customerId: CUSTOMER, phoneHash: 'x', expiresAt: 'y' }, error: null })
    expect(await resolveCustomerSession(headers(`Bearer ${token}`), TENANT)).toEqual({ customerId: CUSTOMER, tokenHash })
    expect(rpc).toHaveBeenCalledWith('touch_customer_app_session', { p_tenant_id: TENANT, p_token_hash: tokenHash })
  })

  it('no token, a malformed one, or a token the database does not know for this store → signed out', async () => {
    const { resolveCustomerSession, tokens } = await load()
    expect(await resolveCustomerSession(headers(null), TENANT)).toBeNull()
    expect(await resolveCustomerSession(headers('Bearer nope'), TENANT)).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValue({ data: { ok: false }, error: null })
    expect(await resolveCustomerSession(headers(`Bearer ${tokens.createAppSessionToken().token}`), TENANT)).toBeNull()
  })

  it('a database error is "unavailable", never "signed out"', async () => {
    const { resolveCustomerSession, tokens } = await load()
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } })
    await expect(resolveCustomerSession(headers(`Bearer ${tokens.createAppSessionToken().token}`), TENANT)).rejects.toThrow(/customer account/)
  })
})

describe('readProfile', () => {
  it('prefers the app name, falls back to the store record, and reads a deleted account as null', async () => {
    const { readProfile } = await load()
    rows.customer_app_profiles = { data: { display_name: null }, error: null }
    rows.customers = { data: { phone_e164: '+639171234567', name: 'Ana' }, error: null }
    expect(await readProfile(TENANT, CUSTOMER)).toEqual({ name: 'Ana', phoneE164: '+639171234567' })
    rows.customer_app_profiles = { data: { display_name: 'Ana C.' }, error: null }
    expect((await readProfile(TENANT, CUSTOMER))?.name).toBe('Ana C.')
    rows.customer_app_profiles = { data: null, error: null }
    expect(await readProfile(TENANT, CUSTOMER)).toBeNull()
  })
})

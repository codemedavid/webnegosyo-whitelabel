import { describe, it, expect, jest } from '@jest/globals'
import { createTenantOwnerWithClient, generateOwnerPassword, listTenantUsersWithClient, resolveTenantLoginUrl } from '@/lib/tenant-owner-provisioning'

const TENANT = '11111111-1111-4111-8111-111111111111'

/** A chainable stub of the few PostgREST calls the provisioner makes. */
function makeClient(opts: { users?: unknown[]; tenant?: unknown; insertError?: { message: string } | null; deleteError?: { message: string } | null } = {}) {
  const inserted: unknown[] = []
  const deleted: string[] = []
  const createUser = jest.fn(async (_input: unknown) => ({ data: { user: { id: 'auth-1', email: 'owner@acme.ph' } }, error: null }))
  const deleteUser = jest.fn(async (id: string) => { deleted.push(id); return { error: opts.deleteError ?? null } })

  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    const rows = table === 'app_users' ? (opts.users ?? []) : []
    Object.assign(builder, {
      select: () => builder,
      eq: () => builder,
      order: () => Promise.resolve({ data: rows, error: null }),
      maybeSingle: () => Promise.resolve({ data: table === 'tenants' ? (opts.tenant === undefined ? { id: TENANT, slug: 'acme' } : opts.tenant) : null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
      insert: (row: unknown) => { inserted.push(row); return Promise.resolve({ error: opts.insertError ?? null }) },
    })
    return builder
  }

  return { client: { from, auth: { admin: { createUser, deleteUser } } } as never, inserted, deleted, createUser, deleteUser }
}

describe('generateOwnerPassword', () => {
  it('is 16 chars from an unambiguous alphabet', () => {
    const pw = generateOwnerPassword()
    expect(pw).toHaveLength(16)
    expect(pw).not.toMatch(/[0OIl1]/)
  })
})

describe('resolveTenantLoginUrl', () => {
  it('prefers the configured app URL, then the platform root domain', () => {
    expect(resolveTenantLoginUrl('acme', { NEXT_PUBLIC_APP_URL: 'https://www.webnegosyo.com/' } as never)).toBe('https://www.webnegosyo.com/acme/login')
    expect(resolveTenantLoginUrl('acme', { PLATFORM_ROOT_DOMAIN: 'webnegosyo.com' } as never)).toBe('https://webnegosyo.com/acme/login')
    expect(resolveTenantLoginUrl('acme', {} as never)).toBe('/acme/login')
  })
})

describe('createTenantOwnerWithClient', () => {
  it('creates the auth user then the owner row, returning a generated password once', async () => {
    const stub = makeClient()

    const result = await createTenantOwnerWithClient(stub.client, { tenantId: TENANT, email: 'owner@acme.ph', displayName: 'Ana' })

    expect(stub.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'owner@acme.ph', email_confirm: true }))
    expect(stub.inserted[0]).toMatchObject({ user_id: 'auth-1', role: 'admin', tenant_id: TENANT, email: 'owner@acme.ph', display_name: 'Ana', is_owner: true, permissions: null, outlet_id: null })
    expect(result.passwordGenerated).toBe(true)
    expect(result.password).toHaveLength(16)
    expect(result.loginUrl).toMatch(/\/acme\/login$/)
    expect(result.tenantSlug).toBe('acme')
  })

  it('uses the supplied password verbatim', async () => {
    const stub = makeClient()
    const result = await createTenantOwnerWithClient(stub.client, { tenantId: TENANT, email: 'owner@acme.ph', password: 'ChosenPass99' })
    expect(stub.createUser).toHaveBeenCalledWith(expect.objectContaining({ password: 'ChosenPass99' }))
    expect(result).toMatchObject({ password: 'ChosenPass99', passwordGenerated: false })
  })

  it('refuses a second owner BEFORE creating any auth user', async () => {
    const stub = makeClient({ users: [{ user_id: 'u0', role: 'admin', is_owner: true, outlet_id: null }] })
    await expect(createTenantOwnerWithClient(stub.client, { tenantId: TENANT, email: 'x@y.co' })).rejects.toThrow(/already has an owner/)
    expect(stub.createUser).not.toHaveBeenCalled()
  })

  it('refuses an unknown tenant', async () => {
    const stub = makeClient({ tenant: null })
    await expect(createTenantOwnerWithClient(stub.client, { tenantId: TENANT, email: 'x@y.co' })).rejects.toThrow(/not found/i)
    expect(stub.createUser).not.toHaveBeenCalled()
  })

  it('deletes the auth user again when the app_users row fails', async () => {
    const stub = makeClient({ insertError: { message: 'duplicate key' } })
    await expect(createTenantOwnerWithClient(stub.client, { tenantId: TENANT, email: 'x@y.co' })).rejects.toThrow(/duplicate key/)
    expect(stub.deleted).toEqual(['auth-1'])
  })

  it('reports when the cleanup also failed', async () => {
    const stub = makeClient({ insertError: { message: 'duplicate key' }, deleteError: { message: 'gone' } })
    await expect(createTenantOwnerWithClient(stub.client, { tenantId: TENANT, email: 'x@y.co' })).rejects.toThrow(/cleanup.*gone/)
  })

  it('validates the envelope', async () => {
    const stub = makeClient()
    await expect(createTenantOwnerWithClient(stub.client, { tenantId: TENANT, email: 'nope' })).rejects.toThrow()
    await expect(createTenantOwnerWithClient(stub.client, { tenantId: TENANT, email: 'a@b.co', password: 'short' })).rejects.toThrow(/8 characters/)
  })
})

describe('listTenantUsersWithClient', () => {
  it('returns the rows for the tenant', async () => {
    const stub = makeClient({ users: [{ user_id: 'u1', email: 'a@b.co', is_owner: true }] })
    const users = await listTenantUsersWithClient(stub.client, TENANT)
    expect(users[0]).toMatchObject({ user_id: 'u1', is_owner: true })
  })
})

import {
  fetchAppUserScope,
  APP_USER_SCOPE_SELECT,
  APP_USER_LEGACY_SELECT,
} from '@/lib/queries/fetch-app-user-scope'

/**
 * Reading the signed-in admin's row, including the branch it is confined to.
 *
 * Every admin action funnels through this read, so a projection that names a
 * column the database does not have yet would not degrade one feature — it
 * would 400 the whole admin. That is the same failure that once served
 * "Restaurant not found" for every storefront (fetch-tenant-by-slug.ts), and
 * the deploy window it lives in is unavoidable: code ships before a migration
 * is applied at least momentarily.
 *
 * Falling back means the account reads as store-wide, which is precisely what
 * every account meant before branches existed.
 */

interface FakeResult {
  data: unknown
  error: { code?: string; message: string } | null
}

function makeClient(byProjection: Record<string, FakeResult>) {
  const projections: string[] = []
  const client = {
    from: () => ({
      select: (projection: string) => {
        projections.push(projection)
        const result = byProjection[projection] ?? {
          data: null,
          error: { code: '42703', message: `column does not exist: ${projection}` },
        }
        return {
          eq: () => ({ maybeSingle: async () => result }),
        }
      },
    }),
  }
  return { client, projections }
}

const ROW = {
  role: 'admin',
  tenant_id: 'tenant-1',
  is_owner: false,
  permissions: ['orders'],
  outlet_id: 'outlet-north',
}

describe('fetchAppUserScope', () => {
  it('returns the row including its branch', async () => {
    const { client } = makeClient({ [APP_USER_SCOPE_SELECT]: { data: ROW, error: null } })

    const result = await fetchAppUserScope(client, 'user-1')

    expect(result.appUser).toEqual(ROW)
    expect(result.error).toBeNull()
    expect(result.isDegraded).toBe(false)
  })

  it('falls back to the pre-branch projection when outlet_id does not exist yet', async () => {
    const legacyRow = {
      role: 'admin',
      tenant_id: 'tenant-1',
      is_owner: false,
      permissions: ['orders'],
    }
    const { client, projections } = makeClient({
      [APP_USER_SCOPE_SELECT]: { data: null, error: { code: '42703', message: 'no outlet_id' } },
      [APP_USER_LEGACY_SELECT]: { data: legacyRow, error: null },
    })

    const result = await fetchAppUserScope(client, 'user-1')

    expect(result.appUser).toEqual(legacyRow)
    expect(result.isDegraded).toBe(true)
    expect(result.error).toBeNull()
    expect(projections).toEqual([APP_USER_SCOPE_SELECT, APP_USER_LEGACY_SELECT])
  })

  it('reads a degraded row as store-wide rather than branch-locked', async () => {
    const { client } = makeClient({
      [APP_USER_SCOPE_SELECT]: { data: null, error: { code: '42703', message: 'no outlet_id' } },
      [APP_USER_LEGACY_SELECT]: {
        data: { role: 'admin', tenant_id: 'tenant-1', is_owner: false, permissions: null },
        error: null,
      },
    })

    const result = await fetchAppUserScope(client, 'user-1')

    expect(result.appUser?.outlet_id ?? null).toBeNull()
  })

  it('does not retry on an unrelated error', async () => {
    const { client, projections } = makeClient({
      [APP_USER_SCOPE_SELECT]: { data: null, error: { code: '08006', message: 'connection lost' } },
    })

    const result = await fetchAppUserScope(client, 'user-1')

    expect(result.appUser).toBeNull()
    expect(result.error).toBe('connection lost')
    expect(projections).toEqual([APP_USER_SCOPE_SELECT])
  })

  it('reports a missing row without an error (an account with no admin row)', async () => {
    const { client } = makeClient({ [APP_USER_SCOPE_SELECT]: { data: null, error: null } })

    const result = await fetchAppUserScope(client, 'user-1')

    expect(result.appUser).toBeNull()
    expect(result.error).toBeNull()
  })

  it('surfaces a failure of the fallback query itself', async () => {
    const { client } = makeClient({
      [APP_USER_SCOPE_SELECT]: { data: null, error: { code: '42703', message: 'no outlet_id' } },
      [APP_USER_LEGACY_SELECT]: { data: null, error: { code: '08006', message: 'connection lost' } },
    })

    const result = await fetchAppUserScope(client, 'user-1')

    expect(result.appUser).toBeNull()
    expect(result.error).toBe('connection lost')
  })
})

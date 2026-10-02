/**
 * Platform staff in a store's own admin are held to their `stores.*` verbs.
 *
 * Every admin server action funnels through verifyTenantAdmin, and most write
 * with the service role afterwards — so for those actions this check, not
 * RLS, is the boundary. The default verb is `edit`: an action that forgets to
 * say what it does is treated as a write, never as a read.
 */

const getUser = jest.fn()
const appUserRow = jest.fn()
const subscriptionRow = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser },
      from: (table: string) => {
        const chain: Record<string, unknown> = {
          maybeSingle: () => (table === 'tenant_subscriptions' ? subscriptionRow() : appUserRow()),
          single: () => appUserRow(),
        }
        chain.select = () => chain
        chain.eq = () => chain
        return chain
      },
    }),
}))

jest.mock('@/lib/queries/fetch-app-user-scope', () => ({
  asAppUserQueryClient: (client: unknown) => client,
  fetchAppUserScope: () => appUserRow(),
}))

import { verifyTenantAdmin, verifyTenantPermission } from '@/lib/admin-service'

const TENANT = 't1'
const LAPSED = {
  tenant_id: TENANT,
  status: 'active',
  monthly_price_php: 649,
  paid_through: '2020-01-01',
  grace_days: 3,
}

function asStaff(platform_permissions: string[] | null, permissions: string[] | null = null) {
  appUserRow.mockResolvedValue({
    appUser: { role: 'platform_staff', tenant_id: null, is_owner: false, permissions, platform_permissions },
    error: null,
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  subscriptionRow.mockResolvedValue({ data: null, error: null })
})

describe('verifyTenantAdmin for platform staff', () => {
  test('lets a viewer read', async () => {
    asStaff(['stores.view'])

    await expect(verifyTenantAdmin(TENANT, 'view')).resolves.toMatchObject({
      userRole: { role: 'platform_staff' },
    })
  })

  test('treats an unspecified verb as a write and refuses a viewer', async () => {
    asStaff(['stores.view'])

    await expect(verifyTenantAdmin(TENANT)).rejects.toThrow(/Unauthorized/)
  })

  test('lets an editor edit but not delete', async () => {
    asStaff(['stores.view', 'stores.edit'])

    await expect(verifyTenantAdmin(TENANT, 'edit')).resolves.toBeDefined()
    await expect(verifyTenantAdmin(TENANT, 'delete')).rejects.toThrow(/Unauthorized/)
    await expect(verifyTenantAdmin(TENANT, 'create')).rejects.toThrow(/Unauthorized/)
  })

  test('refuses staff with no store-dashboard grant at all', async () => {
    asStaff(['tenants.view', 'tenants.edit'])

    await expect(verifyTenantAdmin(TENANT, 'view')).rejects.toThrow(/Unauthorized/)
  })

  test('refuses staff whose grants are NULL', async () => {
    asStaff(null)

    await expect(verifyTenantAdmin(TENANT, 'view')).rejects.toThrow(/Unauthorized/)
  })

  test('is not locked out of a lapsed store, like a superadmin', async () => {
    asStaff(['stores.view', 'stores.edit'])
    subscriptionRow.mockResolvedValue({ data: LAPSED, error: null })

    await expect(verifyTenantAdmin(TENANT, 'edit')).resolves.toBeDefined()
  })
})

describe('verifyTenantPermission for platform staff', () => {
  test('applies the store-feature list on top of the verb', async () => {
    asStaff(['stores.view', 'stores.edit'], ['menu'])

    await expect(verifyTenantPermission(TENANT, 'menu', 'edit')).resolves.toBeDefined()
    await expect(verifyTenantPermission(TENANT, 'orders', 'edit')).rejects.toThrow(/Missing permission/)
  })

  test('grants every store feature when no feature list is set', async () => {
    asStaff(['stores.view'], null)

    await expect(verifyTenantPermission(TENANT, 'orders', 'view')).resolves.toBeDefined()
  })
})

describe('tenant admins are unaffected by the verb', () => {
  test('an admin of the store may delete', async () => {
    appUserRow.mockResolvedValue({
      appUser: { role: 'admin', tenant_id: TENANT, is_owner: true, permissions: null },
      error: null,
    })

    await expect(verifyTenantAdmin(TENANT, 'delete')).resolves.toBeDefined()
  })

  test('an admin of another store is refused', async () => {
    appUserRow.mockResolvedValue({
      appUser: { role: 'admin', tenant_id: 'other', is_owner: true, permissions: null },
      error: null,
    })

    await expect(verifyTenantAdmin(TENANT, 'view')).rejects.toThrow(/Unauthorized/)
  })
})

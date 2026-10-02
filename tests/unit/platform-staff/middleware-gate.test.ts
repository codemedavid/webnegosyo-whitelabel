/**
 * @jest-environment node
 */
/**
 * The middleware is the page gate for platform staff: console pages open only
 * with the section grant they need, team management never opens, and a store's
 * admin opens only with `stores.view` and the store-feature list.
 */
import { NextRequest } from 'next/server'

const getUser = jest.fn()
let appUserRow: Record<string, unknown> | null = null
const createServerClient = jest.fn<Record<string, unknown>, unknown[]>(() => ({
  auth: { getUser },
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: appUserRow, error: null }) }) }),
  }),
}))

jest.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => createServerClient(...args),
}))
jest.mock('@/lib/tenant', () => ({
  resolveTenantSlugFromRequest: async () => null,
}))

const SESSION_COOKIE = 'sb-abc-auth-token=token'

async function run(path: string) {
  jest.resetModules()
  const { middleware } = await import('@/middleware')
  return middleware(new NextRequest(`https://www.webnegosyo.com${path}`, { headers: { cookie: SESSION_COOKIE } }))
}

function staff(platform_permissions: string[] | null, permissions: string[] | null = null) {
  appUserRow = {
    role: 'platform_staff',
    tenant_id: null,
    is_owner: false,
    permissions,
    outlet_id: null,
    platform_permissions,
  }
}

const location = (response: Response) => response.headers.get('location')

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  appUserRow = null
})

describe('console pages', () => {
  it('opens a section the staff account holds', async () => {
    staff(['tenants.view'])

    expect(location(await run('/superadmin/tenants'))).toBeNull()
  })

  it('sends staff away from a section they lack, to one they hold', async () => {
    staff(['leads.view'])

    expect(location(await run('/superadmin/subscriptions'))).toContain('/superadmin/leads')
  })

  it('refuses the create page to a view-only account', async () => {
    staff(['tenants.view'])

    expect(location(await run('/superadmin/tenants/new'))).toContain('/superadmin/tenants?denied=1')
  })

  it('never opens team management to staff', async () => {
    staff(['tenants.view', 'tenants.create', 'tenants.edit', 'tenants.delete'])

    expect(location(await run('/superadmin/team'))).not.toBeNull()
  })

  it('opens team management to a superadmin', async () => {
    appUserRow = { role: 'superadmin', tenant_id: null, is_owner: false, permissions: null, outlet_id: null }

    expect(location(await run('/superadmin/team'))).toBeNull()
  })

  it('bounces a store admin to the console login', async () => {
    appUserRow = { role: 'admin', tenant_id: 't1', is_owner: true, permissions: null, outlet_id: null }

    expect(location(await run('/superadmin/tenants'))).toContain('/superadmin/login?unauthorized=1')
  })
})

describe('store dashboards', () => {
  it('opens any store to staff with stores.view', async () => {
    staff(['stores.view'])

    expect(location(await run('/shop/admin/menu'))).toBeNull()
  })

  it('refuses staff without stores.view', async () => {
    staff(['tenants.view', 'tenants.edit'])

    expect(location(await run('/shop/admin'))).toContain('/shop/login')
  })

  it('narrows staff to their store-feature list', async () => {
    staff(['stores.view'], ['menu'])

    expect(location(await run('/shop/admin/menu'))).toBeNull()
    expect(location(await run('/shop/admin/orders'))).toContain('/shop/admin?denied=orders')
  })
})

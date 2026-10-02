/**
 * @jest-environment node
 */

/**
 * updateTenantAction — what a platform staff account with `tenants.edit` may
 * change. Staff edit details, flags and integrations; where a store's orders go
 * (order backend, Convex URL, Convex deploy key) stays with a superadmin. The
 * custom domain is never written by this action for anyone: the TXT-proven
 * custom-domain flow is its only writer.
 */

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

jest.mock('@/lib/tenant-secrets', () => ({
  upsertTenantSecrets: jest.fn(async () => undefined),
  getTenantSecrets: jest.fn(async () => null),
}))

jest.mock('@/lib/convex-config-sync', () => ({
  syncTenantConvexConfig: jest.fn(async () => ({ ok: true })),
  convexConfigSyncWarning: jest.fn(() => undefined),
}))

jest.mock('@/lib/cache', () => ({
  invalidateTenantCache: jest.fn(async () => undefined),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}))

const TENANT_ID = 'e93cdbd8-cc3b-4000-bfaa-040131a456f1'
const STORED_CONVEX_URL = 'https://happy-otter-1.convex.cloud'

const BASE_INPUT = {
  name: 'Shak-Owl',
  slug: 'shak-owl',
  domain: null,
  primary_color: '#000000',
  secondary_color: '#ffffff',
  messenger_page_id: '123456789',
  convex_deployment_url: STORED_CONVEX_URL,
  order_backend: 'convex' as const,
}

const STAFF = { role: 'platform_staff', platform_permissions: ['tenants.view', 'tenants.edit'] }
const SUPERADMIN = { role: 'superadmin', platform_permissions: null }

let updatedPayload: Record<string, unknown> | null = null

function fakeSupabaseClient(appUser: Record<string, unknown>) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'console-user' } }, error: null }),
    },
    from: (table: string) => {
      if (table === 'app_users') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: appUser, error: null }) }),
          }),
        }
      }

      if (table === 'tenants') {
        return {
          select: () => ({
            eq: () => ({
              neq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
              maybeSingle: async () => ({
                data: { order_backend: 'convex', slug: 'shak-owl', convex_deployment_url: STORED_CONVEX_URL },
                error: null,
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            updatedPayload = payload
            return {
              eq: () => ({
                select: () => ({
                  single: async () => ({ data: { id: TENANT_ID, slug: 'shak-owl' }, error: null }),
                }),
              }),
            }
          },
        }
      }

      throw new Error(`unexpected table ${table}`)
    },
  }
}

// next/jest's SWC transform does NOT hoist `jest.mock` above static imports in
// this repo, so the action and its mocked collaborators are imported lazily.
async function loadUpdateTenantAction(appUser: Record<string, unknown>) {
  const { createClient } = await import('@/lib/supabase/server')
  ;(createClient as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>).mockResolvedValue(
    fakeSupabaseClient(appUser) as never
  )
  const { createAdminClient } = await import('@/lib/supabase/admin')
  ;(createAdminClient as unknown as jest.Mock<(...args: unknown[]) => unknown>).mockReturnValue(
    fakeSupabaseClient(appUser) as never
  )
  const { updateTenantAction } = await import('@/actions/tenants')
  return updateTenantAction
}

beforeEach(() => {
  updatedPayload = null
})

describe('updateTenantAction — platform staff edit scope', () => {
  it('saves a staff edit that leaves the order routing unchanged', async () => {
    const updateTenantAction = await loadUpdateTenantAction(STAFF)

    const result = await updateTenantAction(TENANT_ID, { ...BASE_INPUT, name: 'Shak-Owl Café' } as never)

    expect(result).toMatchObject({ success: true })
    expect(updatedPayload).toMatchObject({ name: 'Shak-Owl Café' })
  })

  it('refuses a staff edit that points the store at another Convex deployment', async () => {
    const updateTenantAction = await loadUpdateTenantAction(STAFF)

    const result = await updateTenantAction(TENANT_ID, {
      ...BASE_INPUT,
      convex_deployment_url: 'https://evil-fox-9.convex.cloud',
    } as never)

    expect(result).toEqual({ error: expect.stringMatching(/only a superadmin/i) })
    expect(updatedPayload).toBeNull()
  })

  it('refuses a staff edit that switches the order backend or sets a deploy key', async () => {
    const updateTenantAction = await loadUpdateTenantAction(STAFF)

    expect(await updateTenantAction(TENANT_ID, { ...BASE_INPUT, order_backend: 'platform' } as never))
      .toEqual({ error: expect.stringMatching(/order backend/i) })
    expect(await updateTenantAction(TENANT_ID, { ...BASE_INPUT, convex_deploy_key: 'prod:x|y' } as never))
      .toEqual({ error: expect.stringMatching(/deploy key/i) })
    expect(updatedPayload).toBeNull()
  })

  it('lets a superadmin change the order routing', async () => {
    const updateTenantAction = await loadUpdateTenantAction(SUPERADMIN)

    const result = await updateTenantAction(TENANT_ID, { ...BASE_INPUT, order_backend: 'platform' } as never)

    expect(result).toMatchObject({ success: true })
    expect(updatedPayload).toMatchObject({ order_backend: 'platform' })
  })

  it('never writes the custom domain, even when one is sent', async () => {
    const updateTenantAction = await loadUpdateTenantAction(SUPERADMIN)

    await updateTenantAction(TENANT_ID, { ...BASE_INPUT, domain: 'someone-elses-shop.com' } as never)

    expect(updatedPayload).not.toBeNull()
    expect(updatedPayload).not.toHaveProperty('domain')
  })
})

// A module, so its constants do not collide with other script-style suites.
export {}

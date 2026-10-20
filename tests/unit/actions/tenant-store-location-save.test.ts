/**
 * @jest-environment node
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals'

/**
 * Production (Sentry JAVASCRIPT-NEXTJS-2X, `POST /superadmin/tenants/[id]`):
 * saving a tenant that has distance-based delivery enabled crashed the server
 * action with an UNCAUGHT `ZodError: [ { path: ["restaurant_latitude"], … } ]`.
 *
 * Two defects, one symptom:
 *
 *  1. The superadmin form's address box wiped the stored coordinates. The
 *     Mapbox autocomplete reports `onChange(address)` with NO coordinates on
 *     every keystroke, and the form overwrote latitude/longitude with `''`
 *     each time — so a tenant with a perfectly good saved location submitted
 *     one with none.
 *  2. `updateTenantAction` validated with `tenantSchema.parse`, so the refusal
 *     left the action as a thrown `ZodError`. Next.js reports that as an
 *     uncaught server-action crash: the superadmin got a broken page instead
 *     of a message naming the field, and Sentry got `ZodError: [`.
 *
 * These tests pin both halves: the action must always answer with the same
 * `{ error }` envelope every other action in the file uses, and the address
 * field must not destroy coordinates it was never given a replacement for.
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

/** Everything the schema demands, and nothing else, so failures stay on topic. */
const BASE_INPUT = {
  name: 'Shak-Owl',
  slug: 'shak-owl',
  domain: null,
  primary_color: '#000000',
  secondary_color: '#ffffff',
  messenger_page_id: '123456789',
}

/** A store that has distance-based delivery fully configured. */
const DISTANCE_DELIVERY_INPUT = {
  ...BASE_INPUT,
  distance_delivery_enabled: true,
  delivery_price_per_km: 40,
  delivery_min_fee: 40,
  delivery_radius_km: 10,
  restaurant_address: 'B. Soliven Street, Quezon City',
  restaurant_latitude: 14.70229531,
  restaurant_longitude: 121.08885574,
}

let updatedPayload: Record<string, unknown> | null = null

function fakeSupabaseClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'superadmin-user' } }, error: null }),
    },
    from: (table: string) => {
      if (table === 'app_users') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { role: 'superadmin' }, error: null }) }),
          }),
        }
      }

      if (table === 'tenants') {
        return {
          // Slug-uniqueness probe and the current-backend read.
          select: () => ({
            eq: () => ({
              neq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
              maybeSingle: async () => ({
                data: { order_backend: 'platform', slug: 'shak-owl' },
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
async function loadUpdateTenantAction() {
  const { createClient } = await import('@/lib/supabase/server')
  ;(createClient as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>).mockResolvedValue(
    fakeSupabaseClient()
  )
  // The session client authorises the caller; the tenant write itself goes
  // through the service role (platform staff have no RLS write on tenants).
  const { createAdminClient } = await import('@/lib/supabase/admin')
  ;(createAdminClient as unknown as jest.Mock<(...args: unknown[]) => unknown>).mockReturnValue(
    fakeSupabaseClient()
  )
  const { updateTenantAction } = await import('@/actions/tenants')
  return updateTenantAction
}

beforeEach(() => {
  updatedPayload = null
})

describe('updateTenantAction — distance-based delivery store location', () => {
  test('returns a readable error instead of throwing when the store location is missing', async () => {
    // Arrange: exactly what the form submitted in production — delivery on,
    // pricing intact, coordinates gone.
    const updateTenantAction = await loadUpdateTenantAction()
    const input = {
      ...DISTANCE_DELIVERY_INPUT,
      restaurant_latitude: undefined,
      restaurant_longitude: undefined,
    }

    // Act
    const result = await updateTenantAction(TENANT_ID, input as never)

    // Assert: refused, not crashed.
    expect(result).toEqual({
      error: expect.stringContaining('Store location is required'),
    })
    expect(updatedPayload).toBeNull()
  })

  test('names the offending field so the superadmin knows what to fix', async () => {
    const updateTenantAction = await loadUpdateTenantAction()

    const result = await updateTenantAction(TENANT_ID, {
      ...DISTANCE_DELIVERY_INPUT,
      restaurant_latitude: undefined,
      restaurant_longitude: undefined,
    } as never)

    expect(result.error).toContain('restaurant_latitude')
    // The raw ZodError serialization must never reach the client.
    expect(result.error).not.toContain('"code"')
  })

  test('saves the tenant when the store location is present', async () => {
    // Arrange: the legitimate edit that was crashing.
    const updateTenantAction = await loadUpdateTenantAction()

    // Act
    const result = await updateTenantAction(TENANT_ID, DISTANCE_DELIVERY_INPUT as never)

    // Assert
    expect(result.error).toBeUndefined()
    expect(updatedPayload).toMatchObject({
      distance_delivery_enabled: true,
      restaurant_latitude: 14.70229531,
      restaurant_longitude: 121.08885574,
    })
  })

  test('refuses every unset distance-delivery field with a readable message', async () => {
    const updateTenantAction = await loadUpdateTenantAction()

    const result = await updateTenantAction(TENANT_ID, {
      ...BASE_INPUT,
      distance_delivery_enabled: true,
    } as never)

    expect(typeof result.error).toBe('string')
    expect(result.error).toContain('delivery_price_per_km')
  })
})

describe('tenantSchema — shared distance-delivery rule', () => {
  test('accepts a store pinned at the equator/prime meridian (0 is a real coordinate)', async () => {
    const { tenantSchema } = await import('@/lib/tenants-service')

    // A non-PH market: a Philippine store at 0,0 is refused as outside the
    // country (below), but 0 itself must never be read as "not set".
    const parsed = tenantSchema.parse({
      ...DISTANCE_DELIVERY_INPUT,
      lalamove_market: 'SG',
      delivery_min_fee: 0,
      restaurant_latitude: 0,
      restaurant_longitude: 0,
    })

    expect(parsed.restaurant_latitude).toBe(0)
    expect(parsed.delivery_min_fee).toBe(0)
  })
})

describe('tenantSchema — store pin rules', () => {
  const LALAMOVE_INPUT = {
    ...BASE_INPUT,
    lalamove_enabled: true,
    lalamove_api_key: 'pk_test_x',
    lalamove_secret_key: 'sk_test_x',
    lalamove_market: 'PH',
    lalamove_sandbox: true,
  }

  test('leaves the stored pin alone when a partial write omits it', async () => {
    const { tenantSchema } = await import('@/lib/tenants-service')
    expect(tenantSchema.safeParse({ ...LALAMOVE_INPUT, restaurant_address: 'Lucena' }).success).toBe(true)
  })

  test('refuses a Lalamove store with no pickup pin', async () => {
    const { tenantSchema } = await import('@/lib/tenants-service')
    const result = tenantSchema.safeParse({
      ...LALAMOVE_INPUT,
      restaurant_address: 'Lucena',
      restaurant_latitude: null,
      restaurant_longitude: null,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "Pin your store's location on the map. Riders pick up orders there and delivery fees are measured from it.",
    )
  })

  test('refuses a Philippine store pinned in Hong Kong', async () => {
    const { tenantSchema } = await import('@/lib/tenants-service')
    const result = tenantSchema.safeParse({ ...LALAMOVE_INPUT, restaurant_latitude: 22.3193, restaurant_longitude: 114.1694 })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['restaurant_latitude'])
  })

  test('accepts a Lalamove store pinned in the Philippines, and a store with no delivery and no pin', async () => {
    const { tenantSchema } = await import('@/lib/tenants-service')
    expect(tenantSchema.safeParse({ ...LALAMOVE_INPUT, restaurant_latitude: 14.62, restaurant_longitude: 121.07 }).success).toBe(true)
    expect(tenantSchema.safeParse(BASE_INPUT).success).toBe(true)
  })

  test('refuses half a pin', async () => {
    const { tenantSchema } = await import('@/lib/tenants-service')
    expect(tenantSchema.safeParse({ ...BASE_INPUT, restaurant_latitude: 14.62 }).success).toBe(false)
  })
})

describe('updateTenantAction — pin writes', () => {
  test('writes 0-free coordinates through unchanged and leaves an omitted pin alone', async () => {
    const updateTenantAction = await loadUpdateTenantAction()
    await updateTenantAction(TENANT_ID, BASE_INPUT as never)
    expect(updatedPayload).not.toBeNull()
    expect(updatedPayload).not.toHaveProperty('restaurant_latitude', null)
    expect(updatedPayload?.restaurant_latitude).toBeUndefined()
  })

  test('clears the pin when the caller sends null', async () => {
    const updateTenantAction = await loadUpdateTenantAction()
    await updateTenantAction(TENANT_ID, { ...BASE_INPUT, restaurant_latitude: null, restaurant_longitude: null } as never)
    expect(updatedPayload).toMatchObject({ restaurant_latitude: null, restaurant_longitude: null })
  })
})


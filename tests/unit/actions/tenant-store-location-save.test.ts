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

    const parsed = tenantSchema.parse({
      ...DISTANCE_DELIVERY_INPUT,
      delivery_min_fee: 0,
      restaurant_latitude: 0,
      restaurant_longitude: 0,
    })

    expect(parsed.restaurant_latitude).toBe(0)
    expect(parsed.delivery_min_fee).toBe(0)
  })
})

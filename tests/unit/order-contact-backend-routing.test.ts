/**
 * The receipt-QR contact capture had the same misroute as order tracking.
 *
 * `updateOrderContact` picked its backend from the credentials on the tenant
 * row — a Convex deployment URL meant Convex — while checkout picks it with
 * `resolveOrderBackend`, which honours a deliberate `order_backend` pin first.
 * A store pinned to the platform database that still carries a Convex URL
 * therefore had the customer's phone number written against an order that
 * only exists in the other database: the lookup returns nothing and the
 * customer is told their order could not be found.
 *
 * Same contract as `order-tracking-backend-routing.test.ts`: reads and writes
 * for one store must agree on where that store's orders live.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = '22222222-2222-4222-8222-222222222222'
const TOKEN = 'a'.repeat(64)
const CONVEX_URL = 'https://robust-bass-874.convex.cloud'

const PLATFORM_ORDER = {
  id: ORDER_ID,
  customer_contact: null,
  customer_name: null,
  status: 'preparing',
}

type TableReader = (table: string, columns: string) => Record<string, unknown> | null

/**
 * A Supabase stub covering the chains the contact service uses:
 * `.from(t).select(c).eq().eq().maybeSingle()` and `.from(t).update(v).eq().eq()`.
 */
function makeAdminClient(read: TableReader, onUpdate: (values: unknown) => void) {
  return {
    from: (table: string) => {
      let columns = ''
      const builder = {
        select: (cols: string) => {
          columns = cols
          return builder
        },
        update: (values: unknown) => {
          onUpdate(values)
          return builder
        },
        eq: () => builder,
        single: async () => ({ data: read(table, columns), error: null }),
        maybeSingle: async () => ({ data: read(table, columns), error: null }),
        // An `update(...).eq(...).eq(...)` chain is awaited directly.
        then: (resolve: (value: { error: null }) => unknown) => resolve({ error: null }),
      }
      return builder
    },
  }
}

const createAdminClient = jest.fn()
const createConvexServerClient = jest.fn()
const runLoyaltyAfterAttach = jest.fn()

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: (...args: unknown[]) => createAdminClient(...args),
}))

jest.mock('@/lib/convex/server', () => ({
  createConvexServerClient: (...args: unknown[]) => {
    createConvexServerClient(...args)
    return { query: async () => null, mutation: async () => null }
  },
}))

jest.mock('@/lib/tenant-secrets', () => ({
  getTenantSecrets: async () => ({ convex_deploy_key: 'deploy-key' }),
}))

jest.mock('@/lib/tracking-token', () => ({
  verifyTrackingToken: () => true,
  MIN_TRACKING_TOKEN_HEX: 20,
}))

jest.mock('@/lib/loyalty/contact-earning', () => ({
  summarizeContactEarning: () => ({ state: 'attached' }),
}))

/** Keeps the loyalty side-effect out of a routing test. */
jest.mock('@/lib/loyalty/lifecycle', () => ({
  runLoyaltyForOrder: (...args: unknown[]) => runLoyaltyAfterAttach(...args),
}))

const SUBMISSION = {
  orderId: ORDER_ID,
  tenantId: TENANT_ID,
  token: TOKEN,
  contact: '09171234567',
  name: 'Ana',
}

async function submitContact() {
  const { updateOrderContact } = await import('@/lib/order-contact-service')
  return updateOrderContact(SUBMISSION)
}

describe('receipt contact capture writes to the backend checkout wrote to', () => {
  let updated: unknown[]

  beforeEach(() => {
    jest.clearAllMocks()
    updated = []
  })

  function arrangeTenant(tenantRow: Record<string, unknown>) {
    createAdminClient.mockReturnValue(
      makeAdminClient(
        (table) => (table === 'tenants' ? tenantRow : PLATFORM_ORDER),
        (values) => updated.push(values)
      )
    )
  }

  it('writes to the platform database for a tenant pinned to platform that still has a Convex deployment', async () => {
    // Arrange
    arrangeTenant({ order_backend: 'platform', convex_deployment_url: CONVEX_URL })

    // Act
    const result = await submitContact()

    // Assert — the number lands on the order that actually exists.
    expect(result.ok).toBe(true)
    expect(updated).toHaveLength(1)
    expect(createConvexServerClient).not.toHaveBeenCalled()
  })

  it('writes to Convex for an unpinned tenant that has a Convex deployment', async () => {
    arrangeTenant({ order_backend: 'auto', convex_deployment_url: CONVEX_URL })

    await submitContact()

    expect(createConvexServerClient).toHaveBeenCalledWith(CONVEX_URL, 'deploy-key')
    expect(updated).toHaveLength(0)
  })

  it('writes to the platform database for a tenant with no per-tenant backend at all', async () => {
    arrangeTenant({ order_backend: null, convex_deployment_url: null })

    const result = await submitContact()

    expect(result.ok).toBe(true)
    expect(createConvexServerClient).not.toHaveBeenCalled()
  })
})

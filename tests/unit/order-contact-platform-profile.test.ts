/**
 * A receipt claim on a platform-backend store must link a customer profile.
 *
 * `updateInSupabase` used to write the number onto the order and run loyalty,
 * but never rolled the order into `customers`. Checkout links a profile at
 * create time; a counter sale rung up with no phone had nothing to link, so
 * the number the guest typed on the receipt page landed on the order and
 * nowhere else — the guest never appeared in Customers, and their stamp card
 * was opened with no `customer_id`.
 *
 * The Convex branch already projects through `captureExternalOrderBestEffort`;
 * the platform branch now goes through the same shared upsert checkout uses.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = '22222222-2222-4222-8222-222222222222'
const CUSTOMER_DATA = { email: 'ana@example.com' }

const PLATFORM_ORDER = {
  id: ORDER_ID,
  customer_contact: null,
  customer_name: 'Walk-in',
  customer_data: CUSTOMER_DATA,
  status: 'preparing',
}

const calls: string[] = []
const capturePlatformOrderBestEffort = jest.fn<(...args: unknown[]) => Promise<string | null>>()
const runLoyaltyForOrder = jest.fn<(...args: unknown[]) => Promise<null>>()
let updateError: { message: string } | null = null

function makeAdminClient() {
  return {
    from: (table: string) => {
      const builder = {
        select: () => builder,
        update: () => builder,
        eq: () => builder,
        single: async () => ({
          data: table === 'tenants' ? { order_backend: 'platform', convex_deployment_url: null } : null,
          error: null,
        }),
        maybeSingle: async () => ({ data: PLATFORM_ORDER, error: null }),
        then: (resolve: (value: { error: { message: string } | null }) => unknown) =>
          resolve({ error: updateError }),
      }
      return builder
    },
  }
}

const adminClient = makeAdminClient()

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
jest.mock('@/lib/convex/server', () => ({ createConvexServerClient: jest.fn() }))
jest.mock('@/lib/tenant-secrets', () => ({ getTenantSecrets: async () => null }))
jest.mock('@/lib/tracking-token', () => ({ verifyTrackingToken: () => true, MIN_TRACKING_TOKEN_HEX: 20 }))
jest.mock('@/lib/loyalty/contact-earning', () => ({ summarizeContactEarning: () => ({ state: 'attached' }) }))
jest.mock('@/lib/loyalty/lifecycle', () => ({
  runLoyaltyForOrder: (...args: unknown[]) => runLoyaltyForOrder(...args),
}))
jest.mock('@/lib/customers-service', () => ({
  capturePlatformOrderBestEffort: (...args: unknown[]) => capturePlatformOrderBestEffort(...args),
}))

const SUBMISSION = {
  orderId: ORDER_ID,
  tenantId: TENANT_ID,
  token: 'a'.repeat(64),
  contact: '09171234567',
  name: 'Ana',
}

async function submitContact() {
  const { updateOrderContact } = await import('@/lib/order-contact-service')
  return updateOrderContact(SUBMISSION)
}

describe('receipt claim on a platform store links a customer profile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    calls.length = 0
    updateError = null
    capturePlatformOrderBestEffort.mockImplementation(async () => {
      calls.push('capture')
      return 'customer-1'
    })
    runLoyaltyForOrder.mockImplementation(async () => {
      calls.push('loyalty')
      return null
    })
  })

  it('upserts the profile from the claimed number through the shared capture', async () => {
    const result = await submitContact()

    expect(result.ok).toBe(true)
    expect(capturePlatformOrderBestEffort).toHaveBeenCalledWith(adminClient, TENANT_ID, {
      orderId: ORDER_ID,
      contact: '09171234567',
      name: 'Ana',
      customerData: CUSTOMER_DATA,
    })
  })

  it('never names the profile after a walk-in placeholder', async () => {
    const { updateOrderContact } = await import('@/lib/order-contact-service')
    const { name: _typed, ...withoutName } = SUBMISSION
    void _typed

    await updateOrderContact(withoutName)

    expect(capturePlatformOrderBestEffort).toHaveBeenCalledWith(
      adminClient,
      TENANT_ID,
      expect.objectContaining({ name: null }),
    )
  })

  it('links the profile before earning so the stamp card carries the customer', async () => {
    await submitContact()

    expect(calls).toEqual(['capture', 'loyalty'])
  })

  it('still reports success and earns when the profile capture yields nothing', async () => {
    capturePlatformOrderBestEffort.mockResolvedValueOnce(null)

    const result = await submitContact()

    expect(result).toEqual({ ok: true, loyalty: { state: 'attached' } })
    expect(runLoyaltyForOrder).toHaveBeenCalledTimes(1)
  })

  it('does not capture a profile when the number could not be saved on the order', async () => {
    updateError = { message: 'boom' }

    const result = await submitContact()

    expect(result).toEqual({ ok: false, error: 'unavailable' })
    expect(capturePlatformOrderBestEffort).not.toHaveBeenCalled()
  })
})

/**
 * `capturePlatformOrderBestEffort` — the platform twin of
 * `captureExternalOrderBestEffort`. It wraps the shared `upsertCustomerFromOrder`
 * with the service-role store, and never throws: by the time it runs the order
 * is saved, so a profile bookkeeping failure must not fail the guest's request.
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = '22222222-2222-4222-8222-222222222222'

afterEach(() => {
  jest.restoreAllMocks()
})

describe('capturePlatformOrderBestEffort', () => {
  it('returns null without touching the database for an order that identifies nobody', async () => {
    const { capturePlatformOrderBestEffort } = await import('@/lib/customers-service')
    const from = jest.fn()

    const result = await capturePlatformOrderBestEffort({ from }, TENANT_ID, {
      orderId: ORDER_ID,
      contact: 'walk-in',
    })

    expect(result).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it('returns null and logs with replay context instead of throwing when the store fails', async () => {
    const { capturePlatformOrderBestEffort } = await import('@/lib/customers-service')
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const admin = {
      from: () => {
        throw new Error('db down')
      },
    }

    const result = await capturePlatformOrderBestEffort(admin, TENANT_ID, {
      orderId: ORDER_ID,
      contact: '09171234567',
    })

    expect(result).toBeNull()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('customer capture failed'),
      'db down',
      { tenantId: TENANT_ID, orderId: ORDER_ID },
    )
  })

  it('links the order and returns the customer id when the store succeeds', async () => {
    const { capturePlatformOrderBestEffort } = await import('@/lib/customers-service')
    const updates: Array<{ table: string; values: unknown }> = []
    const admin = {
      from: (table: string) => {
        const builder = {
          select: () => builder,
          insert: () => builder,
          update: (values: unknown) => {
            updates.push({ table, values })
            return builder
          },
          eq: () => builder,
          is: () => builder,
          maybeSingle: async () => ({ data: { id: 'customer-1' }, error: null }),
          then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
            resolve({ data: [], error: null }),
        }
        return builder
      },
    }

    const result = await capturePlatformOrderBestEffort(admin, TENANT_ID, {
      orderId: ORDER_ID,
      contact: '09171234567',
      name: 'Ana',
    })

    expect(result).toBe('customer-1')
    expect(updates).toContainEqual({ table: 'orders', values: { customer_id: 'customer-1' } })
  })
})

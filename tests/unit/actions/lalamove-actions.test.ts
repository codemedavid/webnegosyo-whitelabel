/**
 * @jest-environment node
 *
 * Server actions for Lalamove (src/app/actions/lalamove.ts).
 *
 * These pin the behaviors where the server actions had drifted from the
 * /api/lalamove route that serves the merchant app:
 *  - a thin sync response must never blank fields already on the order
 *  - a driver embedded on the order payload must be read (not only driverId)
 *  - cancel must refuse a delivery that has already finished
 *  - the anon-reachable quotation action must be rate limited and must not
 *    pull the tenant's secret keys with a select('*')
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

// The signing keys live in tenant_secrets, which anon is never granted, so the
// actions read them through the service-role client.
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: jest.fn(async () => undefined),
}))

// Shared (Redis) counters: the old per-instance Map reset on every cold lambda.
jest.mock('@/lib/distributed-rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true, remaining: 10, retryAfterSec: 0 })),
}))

jest.mock('@/lib/action-rate-limit', () => ({
  checkActionRateLimit: jest.fn(async () => ({ allowed: true, retryAfterSec: 0 })),
}))

jest.mock('@/lib/lalamove-service', () => ({
  createLalamoveQuotation: jest.fn(),
  createLalamoveOrder: jest.fn(),
  getLalamoveOrder: jest.fn(),
  getLalamoveDriver: jest.fn(),
  cancelLalamoveOrder: jest.fn(),
  addLalamovePriorityFee: jest.fn(),
}))

const TENANT = {
  id: 't1',
  name: 'Retiro',
  lalamove_enabled: true,
  lalamove_market: 'PH',
  lalamove_sandbox: false,
  lalamove_sender_phone: '09170000000',
  restaurant_address: '88 Retiro St, QC',
  restaurant_latitude: 14.62,
  restaurant_longitude: 121.0,
}

const SECRETS = { lalamove_api_key: 'key', lalamove_secret_key: 'secret' }

describe('lalamove server actions', () => {
  let tenantRow: Record<string, unknown> | null
  let orderRow: Record<string, unknown> | null
  let updateMock: jest.Mock
  let selectMock: jest.Mock
  let secretsSelectMock: jest.Mock
  let eqMock: jest.Mock

  beforeEach(async () => {
    jest.resetModules()
    jest.clearAllMocks()

    tenantRow = { ...TENANT }
    orderRow = { id: 'order-1', lalamove_order_id: 'lala-1', lalamove_status: null }
    updateMock = jest.fn()
    selectMock = jest.fn()
    secretsSelectMock = jest.fn()
    eqMock = jest.fn()

    const { createAdminClient } = await import('@/lib/supabase/admin')
    ;(createAdminClient as unknown as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        const builder: Record<string, unknown> = {}
        builder.select = jest.fn((columns?: string) => {
          secretsSelectMock(table, columns)
          return builder
        })
        builder.eq = jest.fn(() => builder)
        builder.maybeSingle = jest.fn(async () => ({
          data: table === 'tenant_secrets' ? { ...SECRETS } : null,
          error: null,
        }))
        return builder
      }),
    })

    const { createClient } = await import('@/lib/supabase/server')
    ;(createClient as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>).mockResolvedValue({
      from: jest.fn((table: string) => {
        const builder: Record<string, unknown> = {}
        builder.select = jest.fn((columns?: string) => {
          selectMock(table, columns)
          return builder
        })
        builder.eq = jest.fn((column: unknown, value: unknown) => {
          eqMock(table, column, value)
          return builder
        })
        builder.is = jest.fn(() => builder)
        builder.update = jest.fn((patch: unknown) => {
          updateMock(table, patch)
          return builder
        })
        builder.single = jest.fn(async () => ({
          data: table === 'tenants' ? tenantRow : orderRow,
          error: null,
        }))
        builder.maybeSingle = builder.single
        builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null })
        return builder
      }),
    })
  })

  describe('syncLalamoveOrderAction', () => {
    test('a thin poll response never blanks fields already on the order', async () => {
      const service = await import('@/lib/lalamove-service')
      ;(service.getLalamoveOrder as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>).mockResolvedValue({
        status: 'ON_GOING',
        // no shareLink, no driver — Lalamove polls often come back thin
      })

      const { syncLalamoveOrderAction } = await import('@/app/actions/lalamove')
      const result = await syncLalamoveOrderAction('t1', 'order-1', 'lala-1')

      expect(result.success).toBe(true)
      const [, patch] = updateMock.mock.calls.at(-1) as [string, Record<string, unknown>]
      expect(patch).toMatchObject({ lalamove_status: 'ON_GOING' })
      // Writing null here wipes the tracking link a merchant already had.
      expect(patch).not.toHaveProperty('lalamove_tracking_url')
      expect(patch).not.toHaveProperty('lalamove_driver_name')
    })

    test('reads a driver embedded on the order payload, not only via driverId', async () => {
      const service = await import('@/lib/lalamove-service')
      ;(service.getLalamoveOrder as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>).mockResolvedValue({
        status: 'ON_GOING',
        shareLink: 'https://share.lalamove.com/x',
        driver: { name: 'Rico', phone: '+639998887777' },
      })

      const { syncLalamoveOrderAction } = await import('@/app/actions/lalamove')
      const result = await syncLalamoveOrderAction('t1', 'order-1', 'lala-1')

      expect(result.success).toBe(true)
      const [, patch] = updateMock.mock.calls.at(-1) as [string, Record<string, unknown>]
      expect(patch).toMatchObject({
        lalamove_driver_name: 'Rico',
        lalamove_driver_phone: '+639998887777',
      })
    })
  })

  describe('cancelLalamoveOrderAction', () => {
    test('refuses to cancel a delivery that has already finished', async () => {
      orderRow = { id: 'order-1', lalamove_order_id: 'lala-1', lalamove_status: 'DELIVERED' }

      const { cancelLalamoveOrderAction } = await import('@/app/actions/lalamove')
      const result = await cancelLalamoveOrderAction('t1', 'order-1', 'lala-1')

      expect(result.success).toBe(false)

      const service = await import('@/lib/lalamove-service')
      expect(service.cancelLalamoveOrder).not.toHaveBeenCalled()
    })

    test('still cancels a delivery that is underway', async () => {
      orderRow = { id: 'order-1', lalamove_order_id: 'lala-1', lalamove_status: 'ASSIGNING_DRIVER' }
      const service = await import('@/lib/lalamove-service')
      ;(service.cancelLalamoveOrder as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>).mockResolvedValue(true)

      const { cancelLalamoveOrderAction } = await import('@/app/actions/lalamove')
      const result = await cancelLalamoveOrderAction('t1', 'order-1', 'lala-1')

      expect(result.success).toBe(true)
      expect(service.cancelLalamoveOrder).toHaveBeenCalled()
    })
  })

  describe('requoteLalamoveAction', () => {
    test('builds a fresh quotation from the store pin and the order coordinates', async () => {
      orderRow = {
        id: 'order-1',
        lalamove_order_id: null,
        customer_data: { delivery_address: '12 Mabini St', delivery_lat: 14.7, delivery_lng: 121.05 },
      }
      const service = await import('@/lib/lalamove-service')
      ;(service.createLalamoveQuotation as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>).mockResolvedValue({
        quotationId: 'quote-new',
        price: 89,
        currency: 'PHP',
        expiresAt: new Date('2099-01-01T00:00:00Z'),
        distance: '0 km',
        duration: '0 min',
      })

      const { requoteLalamoveAction } = await import('@/app/actions/lalamove')
      const result = await requoteLalamoveAction('t1', 'order-1')

      expect(result.success).toBe(true)
      expect(service.createLalamoveQuotation).toHaveBeenCalledWith(
        expect.objectContaining({ id: 't1' }),
        '88 Retiro St, QC',
        { lat: 14.62, lng: 121.0 },
        '12 Mabini St',
        { lat: 14.7, lng: 121.05 },
      )
      const [, patch] = updateMock.mock.calls.at(-1) as [string, Record<string, unknown>]
      expect(patch).toMatchObject({ lalamove_quotation_id: 'quote-new' })
    })

    test('refuses once a delivery is already booked', async () => {
      orderRow = {
        id: 'order-1',
        lalamove_order_id: 'lala-1',
        customer_data: { delivery_address: '12 Mabini St', delivery_lat: 14.7, delivery_lng: 121.05 },
      }

      const { requoteLalamoveAction } = await import('@/app/actions/lalamove')
      const result = await requoteLalamoveAction('t1', 'order-1')

      expect(result.success).toBe(false)
      const service = await import('@/lib/lalamove-service')
      expect(service.createLalamoveQuotation).not.toHaveBeenCalled()
    })

    test('rebooks after a cancelled delivery: retires the dead booking and stores the new quote', async () => {
      // One accidental Cancel used to strand the order: the dead booking id
      // stayed on it, and every quote or book refused while it was set.
      orderRow = {
        id: 'order-1',
        lalamove_order_id: 'lala-old',
        lalamove_status: 'CANCELLED',
        customer_data: { delivery_address: '12 Mabini St', delivery_lat: 14.7, delivery_lng: 121.05 },
      }
      const service = await import('@/lib/lalamove-service')
      ;(service.createLalamoveQuotation as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>).mockResolvedValue({
        quotationId: 'quote-new',
        price: 89,
        currency: 'PHP',
        expiresAt: new Date('2099-01-01T00:00:00Z'),
        distance: '0 km',
        duration: '0 min',
      })

      const { requoteLalamoveAction } = await import('@/app/actions/lalamove')
      const result = await requoteLalamoveAction('t1', 'order-1')

      expect(result.success).toBe(true)
      const [, patch] = updateMock.mock.calls.at(-1) as [string, Record<string, unknown>]
      expect(patch).toMatchObject({
        lalamove_quotation_id: 'quote-new',
        lalamove_order_id: null,
        lalamove_status: null,
        lalamove_driver_name: null,
        lalamove_tracking_url: null,
      })
      // Guarded on the SAME dead booking, so a rebook racing another cannot
      // wipe a booking made a moment ago.
      expect(eqMock).toHaveBeenCalledWith('orders', 'lalamove_order_id', 'lala-old')
    })

    test('refuses to rebook a delivery that was completed', async () => {
      orderRow = {
        id: 'order-1',
        lalamove_order_id: 'lala-1',
        lalamove_status: 'COMPLETED',
        customer_data: { delivery_address: '12 Mabini St', delivery_lat: 14.7, delivery_lng: 121.05 },
      }

      const { requoteLalamoveAction } = await import('@/app/actions/lalamove')
      const result = await requoteLalamoveAction('t1', 'order-1')

      expect(result.success).toBe(false)
      const service = await import('@/lib/lalamove-service')
      expect(service.createLalamoveQuotation).not.toHaveBeenCalled()
    })

    test('refuses when the order has no delivery coordinates', async () => {
      orderRow = {
        id: 'order-1',
        lalamove_order_id: null,
        customer_data: { delivery_address: '12 Mabini St' },
      }

      const { requoteLalamoveAction } = await import('@/app/actions/lalamove')
      const result = await requoteLalamoveAction('t1', 'order-1')

      expect(result.success).toBe(false)
      const service = await import('@/lib/lalamove-service')
      expect(service.createLalamoveQuotation).not.toHaveBeenCalled()
    })
  })

  describe('createQuotationAction', () => {
    function mockQuote() {
      return import('@/lib/lalamove-service').then((service) => {
        ;(service.createLalamoveQuotation as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>).mockResolvedValue({
          quotationId: 'q1',
          price: 100,
          currency: 'PHP',
          expiresAt: new Date(),
          distance: '0 km',
          duration: '0 min',
        })
        return service
      })
    }

    test('refuses when the tenant is over the quotation rate limit', async () => {
      const { checkRateLimit } = await import('@/lib/distributed-rate-limit')
      ;(checkRateLimit as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>).mockResolvedValue({
        allowed: false,
        remaining: 0,
        retryAfterSec: 30,
      })

      const { createQuotationAction } = await import('@/app/actions/lalamove')
      const result = await createQuotationAction('t1', 'Store', 14.6, 121.0, 'Home', 14.7, 121.1)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/too many|moment/i)
      expect((checkRateLimit as unknown as jest.Mock).mock.calls[0][0]).toBe('lalamove-quote:t1')

      const service = await import('@/lib/lalamove-service')
      expect(service.createLalamoveQuotation).not.toHaveBeenCalled()
    })

    test('refuses when the calling client is over its per-IP quotation limit', async () => {
      const { checkActionRateLimit } = await import('@/lib/action-rate-limit')
      ;(checkActionRateLimit as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>).mockResolvedValue({
        allowed: false,
        retryAfterSec: 30,
      })

      const { createQuotationAction } = await import('@/app/actions/lalamove')
      const result = await createQuotationAction('t1', 'Store', 14.6, 121.0, 'Home', 14.7, 121.1)

      expect(result.success).toBe(false)
      const service = await import('@/lib/lalamove-service')
      expect(service.createLalamoveQuotation).not.toHaveBeenCalled()
    })

    test('quotes from the STORE location on the tenant row, ignoring client-sent pickup values', async () => {
      const service = await mockQuote()

      const { createQuotationAction } = await import('@/app/actions/lalamove')
      // A visitor claims the pickup is next door to the drop-off (a near-free
      // quote the merchant would then be billed the real distance for).
      const result = await createQuotationAction('t1', 'Fake pickup', 14.7, 121.1, 'Home', 14.7, 121.1)

      expect(result.success).toBe(true)
      const call = (service.createLalamoveQuotation as unknown as jest.Mock).mock.calls[0]
      expect(call[1]).toBe(TENANT.restaurant_address)
      expect(call[2]).toEqual({ lat: TENANT.restaurant_latitude, lng: TENANT.restaurant_longitude })
      expect(call[3]).toBe('Home')
      expect(call[4]).toEqual({ lat: 14.7, lng: 121.1 })
      // Vehicle type is the merchant's setting, not the visitor's pick.
      expect(call[5]).toBeUndefined()
    })

    test('refuses when the store pickup location is not configured', async () => {
      tenantRow = { ...TENANT, restaurant_latitude: null, restaurant_longitude: null }
      const service = await mockQuote()

      const { createQuotationAction } = await import('@/app/actions/lalamove')
      const result = await createQuotationAction('t1', 'Store', 14.6, 121.0, 'Home', 14.7, 121.1)

      expect(result.success).toBe(false)
      expect(service.createLalamoveQuotation).not.toHaveBeenCalled()
    })

    test('refuses non-finite delivery coordinates', async () => {
      const service = await mockQuote()

      const { createQuotationAction } = await import('@/app/actions/lalamove')
      const result = await createQuotationAction('t1', 'Store', 14.6, 121.0, 'Home', Number.NaN, 121.1)

      expect(result.success).toBe(false)
      expect(service.createLalamoveQuotation).not.toHaveBeenCalled()
    })

    test('never selects the whole tenant row on the anon-reachable path', async () => {
      await mockQuote()

      const { createQuotationAction } = await import('@/app/actions/lalamove')
      const result = await createQuotationAction('t1', 'Store', 14.6, 121.0, 'Home', 14.7, 121.1)

      expect(result.success).toBe(true)
      const tenantSelect = selectMock.mock.calls.find(([table]) => table === 'tenants')
      expect(tenantSelect).toBeDefined()
      // select('*') drags lalamove_secret_key into a code path any visitor can
      // invoke; the columns must be named and the secrets among them only
      // because the SDK needs them to sign — never the full row.
      const columns = (tenantSelect as [string, string | undefined])[1]
      expect(columns).toBeDefined()
      expect(columns).not.toBe('*')
      // The keys are not on the tenants row at all any more: they come from
      // tenant_secrets, through the service-role client, never the anon one.
      expect(columns).not.toMatch(/lalamove_api_key|lalamove_secret_key/)
      const secretsSelect = secretsSelectMock.mock.calls.find(([table]) => table === 'tenant_secrets')
      expect(secretsSelect).toBeDefined()
      expect(selectMock.mock.calls.find(([table]) => table === 'tenant_secrets')).toBeUndefined()
    })
  })

  describe('createLalamoveOrderAction', () => {
    test('books with the store phone as recipient when the order carries no customer phone', async () => {
      // The panel forwards order.customer_contact verbatim; when the checkout
      // form had no phone field that is ''. Lalamove refuses '' as a phone.
      tenantRow = { ...TENANT, lalamove_sandbox: true }
      orderRow = {
        id: 'order-1',
        lalamove_order_id: null,
        customer_contact: '',
        customer_data: { delivery_address: '12 Mabini St' },
      }
      const service = await import('@/lib/lalamove-service')
      ;(service.createLalamoveOrder as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>).mockResolvedValue({
        orderId: 'lala-new',
        status: 'ASSIGNING_DRIVER',
        shareLink: 'https://share.lalamove.com/lala-new',
      })

      const { createLalamoveOrderAction } = await import('@/app/actions/lalamove')
      const result = await createLalamoveOrderAction('t1', 'order-1', 'quote-1', '', '', 'Ana', '')

      expect(result).toMatchObject({ success: true, recipientPhoneSource: 'store' })
      const call = (service.createLalamoveOrder as unknown as jest.Mock).mock.calls[0] as unknown[]
      expect(call[3]).toBe('+639170000000')
      expect(call[5]).toBe('+639170000000')
    })

    test('refuses to book when the store pickup phone is not a usable number', async () => {
      tenantRow = { ...TENANT, lalamove_sandbox: true, lalamove_sender_phone: 'call us' }
      orderRow = { id: 'order-1', lalamove_order_id: null, customer_contact: '09171234567' }

      const { createLalamoveOrderAction } = await import('@/app/actions/lalamove')
      const result = await createLalamoveOrderAction('t1', 'order-1', 'quote-1', '', '', 'Ana', '09171234567')

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/pickup phone/i)
      const service = await import('@/lib/lalamove-service')
      expect(service.createLalamoveOrder).not.toHaveBeenCalled()
    })
  })
})

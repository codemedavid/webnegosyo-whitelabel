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

jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: jest.fn(async () => undefined),
}))

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(() => ({ allowed: true, remaining: 10, resetTime: 0 })),
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
  lalamove_api_key: 'key',
  lalamove_secret_key: 'secret',
  lalamove_market: 'PH',
  lalamove_sandbox: false,
  lalamove_sender_phone: '09170000000',
}

describe('lalamove server actions', () => {
  let tenantRow: Record<string, unknown> | null
  let orderRow: Record<string, unknown> | null
  let updateMock: jest.Mock
  let selectMock: jest.Mock

  beforeEach(async () => {
    jest.resetModules()
    jest.clearAllMocks()

    tenantRow = { ...TENANT }
    orderRow = { id: 'order-1', lalamove_order_id: 'lala-1', lalamove_status: null }
    updateMock = jest.fn()
    selectMock = jest.fn()

    const { createClient } = await import('@/lib/supabase/server')
    ;(createClient as unknown as jest.Mock).mockResolvedValue({
      from: jest.fn((table: string) => {
        const builder: Record<string, unknown> = {}
        builder.select = jest.fn((columns?: string) => {
          selectMock(table, columns)
          return builder
        })
        builder.eq = jest.fn(() => builder)
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
      ;(service.getLalamoveOrder as unknown as jest.Mock).mockResolvedValue({
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
      ;(service.getLalamoveOrder as unknown as jest.Mock).mockResolvedValue({
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
      ;(service.cancelLalamoveOrder as unknown as jest.Mock).mockResolvedValue(true)

      const { cancelLalamoveOrderAction } = await import('@/app/actions/lalamove')
      const result = await cancelLalamoveOrderAction('t1', 'order-1', 'lala-1')

      expect(result.success).toBe(true)
      expect(service.cancelLalamoveOrder).toHaveBeenCalled()
    })
  })

  describe('createQuotationAction', () => {
    test('refuses when the tenant is over the quotation rate limit', async () => {
      const { checkRateLimit } = await import('@/lib/rate-limit')
      ;(checkRateLimit as unknown as jest.Mock).mockReturnValue({
        allowed: false,
        remaining: 0,
        resetTime: 0,
      })

      const { createQuotationAction } = await import('@/app/actions/lalamove')
      const result = await createQuotationAction('t1', 'Store', 14.6, 121.0, 'Home', 14.7, 121.1)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/too many|moment/i)

      const service = await import('@/lib/lalamove-service')
      expect(service.createLalamoveQuotation).not.toHaveBeenCalled()
    })

    test('never selects the whole tenant row on the anon-reachable path', async () => {
      const service = await import('@/lib/lalamove-service')
      ;(service.createLalamoveQuotation as unknown as jest.Mock).mockResolvedValue({
        quotationId: 'q1',
        price: 100,
        currency: 'PHP',
        expiresAt: new Date(),
        distance: '0 km',
        duration: '0 min',
      })

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
    })
  })
})

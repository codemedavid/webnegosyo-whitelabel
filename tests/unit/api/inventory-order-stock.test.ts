/**
 * @jest-environment node
 *
 * Tests for POST /api/inventory/order-stock
 *
 * The POS register (webnegosyo-app) writes counter sales straight to the
 * tenant's Convex deployment, bypassing `createOrderAction` — the one place
 * order-driven stock depletion is wired. Without this route a register sale
 * never moves stock, which is the single highest-volume stock event a merchant
 * has. The route is the POS's way into the same depletion path every other
 * backend already funnels through.
 *
 * Authenticated via the caller's own Supabase access token, matching
 * /api/revalidate-menu.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/inventory/order-stock-service', () => ({
  applyOrderStockBestEffort: jest.fn(),
  reverseOrderStockBestEffort: jest.fn(),
}))

const VALID_BODY = {
  tenantId: 't1',
  orderId: 'jh7dm2p8qr3n5x9k4tw2vc6y8b',
  items: [{ menuItemId: 'm-latte', quantity: 2, optionIds: ['o-large'] }],
}

function makeRequest(body: unknown, authHeader?: string): NextRequest {
  return new NextRequest('http://localhost/api/inventory/order-stock', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : {},
    body: JSON.stringify(body),
  })
}

describe('POST /api/inventory/order-stock', () => {
  let mockCreateClient: jest.Mock
  let getUserMock: jest.Mock
  let appUserSingleMock: jest.Mock
  let tenantSingleMock: jest.Mock
  let applyMock: jest.Mock
  let reverseMock: jest.Mock

  beforeEach(async () => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    const { createClient } = await import('@supabase/supabase-js')
    mockCreateClient = createClient as unknown as jest.Mock

    getUserMock = jest.fn()
    appUserSingleMock = jest.fn()
    tenantSingleMock = jest.fn()

    // Default: a legitimate admin of t1, whose tenant has inventory enabled.
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    appUserSingleMock.mockResolvedValue({
      data: { role: 'admin', tenant_id: 't1' },
      error: null,
    })
    tenantSingleMock.mockResolvedValue({
      data: { inventory_enabled: true },
      error: null,
    })

    mockCreateClient.mockReturnValue({
      auth: { getUser: getUserMock },
      from: jest.fn((table: string) => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: table === 'tenants' ? tenantSingleMock : appUserSingleMock,
          })),
        })),
      })),
    })

    const service = await import('@/lib/inventory/order-stock-service')
    applyMock = service.applyOrderStockBestEffort as unknown as jest.Mock
    reverseMock = service.reverseOrderStockBestEffort as unknown as jest.Mock
  })

  test('rejects a request missing tenantId or orderId', async () => {
    const { POST } = await import('@/app/api/inventory/order-stock/route')
    const res = await POST(makeRequest({ items: [] }, 'Bearer token-1'))
    expect(res.status).toBe(400)
  })

  test('rejects a request with no Authorization header', async () => {
    const { POST } = await import('@/app/api/inventory/order-stock/route')
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(401)
  })

  test('rejects when the token does not resolve to a user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: new Error('invalid') })
    const { POST } = await import('@/app/api/inventory/order-stock/route')
    const res = await POST(makeRequest(VALID_BODY, 'Bearer bad'))
    expect(res.status).toBe(401)
  })

  test('rejects an admin of a different tenant', async () => {
    appUserSingleMock.mockResolvedValue({
      data: { role: 'admin', tenant_id: 'other-tenant' },
      error: null,
    })
    const { POST } = await import('@/app/api/inventory/order-stock/route')
    const res = await POST(makeRequest(VALID_BODY, 'Bearer token-1'))

    expect(res.status).toBe(403)
    expect(applyMock).not.toHaveBeenCalled()
  })

  test('depletes stock for the caller-s own tenant', async () => {
    const { POST } = await import('@/app/api/inventory/order-stock/route')
    const res = await POST(makeRequest(VALID_BODY, 'Bearer token-1'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(applyMock).toHaveBeenCalledWith(
      't1',
      'jh7dm2p8qr3n5x9k4tw2vc6y8b',
      [
        {
          menuItemId: 'm-latte',
          quantity: 2,
          // The same id set feeds both recipe buckets, matching how
          // createOrderAction hands options to the depletion service.
          optionIds: ['o-large'],
          modifierOptionIds: ['o-large'],
          addonIds: [],
        },
      ],
    )
  })

  test('does nothing when the tenant has inventory disabled', async () => {
    tenantSingleMock.mockResolvedValue({ data: { inventory_enabled: false }, error: null })
    const { POST } = await import('@/app/api/inventory/order-stock/route')
    const res = await POST(makeRequest(VALID_BODY, 'Bearer token-1'))

    expect(res.status).toBe(200)
    expect(applyMock).not.toHaveBeenCalled()
  })

  test('rejects a body whose items are not a list', async () => {
    const { POST } = await import('@/app/api/inventory/order-stock/route')
    const res = await POST(
      makeRequest({ ...VALID_BODY, items: 'not-an-array' }, 'Bearer token-1'),
    )
    expect(res.status).toBe(400)
  })

  describe('restore action', () => {
    const RESTORE_BODY = { tenantId: 't1', orderId: 'jh7dm2p8qr3n5x9', action: 'restore' }

    test('puts a cancelled order-s ingredients back on the shelf', async () => {
      const { POST } = await import('@/app/api/inventory/order-stock/route')
      const res = await POST(makeRequest(RESTORE_BODY, 'Bearer token-1'))

      expect(res.status).toBe(200)
      expect(reverseMock).toHaveBeenCalledWith('t1', 'jh7dm2p8qr3n5x9')
      expect(applyMock).not.toHaveBeenCalled()
    })

    test('needs no items, since the reversal derives from recorded sale movements', async () => {
      // A cancelling client has the order id and nothing else. Recomputing from
      // lines would drift once options are counted, so items are not required.
      const { POST } = await import('@/app/api/inventory/order-stock/route')
      const res = await POST(makeRequest(RESTORE_BODY, 'Bearer token-1'))

      expect(res.status).toBe(200)
    })

    test('rejects a restore from an admin of a different tenant', async () => {
      appUserSingleMock.mockResolvedValue({
        data: { role: 'admin', tenant_id: 'other-tenant' },
        error: null,
      })
      const { POST } = await import('@/app/api/inventory/order-stock/route')
      const res = await POST(makeRequest(RESTORE_BODY, 'Bearer token-1'))

      expect(res.status).toBe(403)
      expect(reverseMock).not.toHaveBeenCalled()
    })

    test('does nothing when the tenant has inventory disabled', async () => {
      tenantSingleMock.mockResolvedValue({ data: { inventory_enabled: false }, error: null })
      const { POST } = await import('@/app/api/inventory/order-stock/route')
      const res = await POST(makeRequest(RESTORE_BODY, 'Bearer token-1'))

      expect(res.status).toBe(200)
      expect(reverseMock).not.toHaveBeenCalled()
    })

    test('rejects an unrecognized action rather than guessing', async () => {
      const { POST } = await import('@/app/api/inventory/order-stock/route')
      const res = await POST(
        makeRequest({ ...RESTORE_BODY, action: 'destroy' }, 'Bearer token-1'),
      )

      expect(res.status).toBe(400)
      expect(reverseMock).not.toHaveBeenCalled()
      expect(applyMock).not.toHaveBeenCalled()
    })

    test('still defaults to depleting when no action is given', async () => {
      // The POS register was shipped before this discriminator existed and
      // sends no action; it must keep depleting.
      const { POST } = await import('@/app/api/inventory/order-stock/route')
      const res = await POST(makeRequest(VALID_BODY, 'Bearer token-1'))

      expect(res.status).toBe(200)
      expect(applyMock).toHaveBeenCalled()
      expect(reverseMock).not.toHaveBeenCalled()
    })
  })

  test('ignores an item with no option ids rather than failing the sale', async () => {
    const { POST } = await import('@/app/api/inventory/order-stock/route')
    const res = await POST(
      makeRequest(
        { ...VALID_BODY, items: [{ menuItemId: 'm-croissant', quantity: 1 }] },
        'Bearer token-1',
      ),
    )

    expect(res.status).toBe(200)
    expect(applyMock).toHaveBeenCalledWith('t1', VALID_BODY.orderId, [
      { menuItemId: 'm-croissant', quantity: 1, optionIds: [], modifierOptionIds: [], addonIds: [] },
    ])
  })
})

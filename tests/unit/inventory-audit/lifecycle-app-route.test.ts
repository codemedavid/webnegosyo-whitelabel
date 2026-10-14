/**
 * @jest-environment node
 *
 * AUDIT — POST /api/inventory/order-stock (merchant app / POS) lifecycle gaps.
 *
 * The merchant app cancels and un-cancels orders without ever reaching
 * `updateOrderStatus`, so this route is its ONLY way to keep stock in step with
 * the order's lifecycle. Each `BUG` case asserts the correct behaviour and
 * FAILS on main.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const reverseMock = jest.fn<(...args: unknown[]) => Promise<void>>(async () => undefined)
const redepleteMock = jest.fn<(...args: unknown[]) => Promise<void>>(async () => undefined)
const releasePresellMock = jest.fn<(...args: unknown[]) => Promise<void>>(async () => undefined)

let storedOrder: Record<string, unknown> | null = null

jest.mock('@/lib/inventory/order-stock-service', () => ({
  applyOrderStockBestEffort: jest.fn(async () => undefined),
  reverseOrderStockBestEffort: reverseMock,
  redepleteOrderStockBestEffort: redepleteMock,
  applyOrderRevisionStockBestEffort: jest.fn(async () => undefined),
}))
jest.mock('@/lib/presell/order-claim', () => ({ releasePresellForOrder: releasePresellMock }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeClient() }))
// The route reads the order through the backend-aware lifecycle reader.
jest.mock('@/lib/order-lifecycle-read', () => ({
  readStoredOrderLifecycle: async () =>
    storedOrder
      ? { status: storedOrder.status, customerData: storedOrder.customer_data ?? null, outletId: storedOrder.outlet_id ?? null }
      : null,
}))

function fakeClient() {
  return {
    from: (table: string) => {
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.single = async () =>
        table === 'tenants' ? { data: { inventory_enabled: true }, error: null } : { data: storedOrder, error: null }
      builder.maybeSingle = async () => ({ data: table === 'orders' ? storedOrder : null, error: null })
      return builder
    },
  }
}

jest.mock('@/lib/auth/bearer-caller', () => ({
  requireBearerStoreCaller: async () => ({
    ok: true,
    supabase: fakeClient(),
    user: { id: 'staff-1' },
    appUser: { outlet_id: null, role: 'admin', tenant_id: 't1' },
  }),
}))

const ORDER_ID = 'b4780bd2-0f9c-47dc-a62a-bd6bd857b4b8'

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/inventory/order-stock', {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  reverseMock.mockClear()
  redepleteMock.mockClear()
  releasePresellMock.mockClear()
  storedOrder = null
})

describe('restore', () => {
  test('BUG — refuses to put back the stock of a platform order that is NOT cancelled', async () => {
    // A live, delivered order: reversing it hides what left the shelf and
    // burns the void claim its real cancellation needs. The web twin
    // (`restoreOrderStock`) checks the stored status; this route does not.
    storedOrder = { id: ORDER_ID, tenant_id: 't1', outlet_id: null, status: 'delivered', customer_data: {} }
    const { POST } = await import('@/app/api/inventory/order-stock/route')

    await POST(post({ tenantId: 't1', orderId: ORDER_ID, action: 'restore' }))

    expect(reverseMock).not.toHaveBeenCalled()
  })

  test('BUG — cancelling a pre-order from the app gives its presell allocation back', async () => {
    // updateOrderStatus (web, platform) and the Convex admin sheet both release
    // the per-date allocation; the app's cancel → restore path never does.
    storedOrder = {
      id: ORDER_ID, tenant_id: 't1', outlet_id: null, status: 'cancelled',
      customer_data: {
        presell_date: '2026-10-20',
        presell_claim_id: 'claim-1',
        presell_lines: [{ menu_item_id: 'menu-1', presell_date: '2026-10-20', quantity: 2 }],
      },
    }
    const { POST } = await import('@/app/api/inventory/order-stock/route')

    await POST(post({ tenantId: 't1', orderId: ORDER_ID, action: 'restore' }))

    expect(reverseMock).toHaveBeenCalled()
    expect(releasePresellMock).toHaveBeenCalled()
  })
})

describe('un-cancel', () => {
  test('BUG — the app has a server path to re-spend an un-cancelled order', async () => {
    // Live: gungjeon-unlimited order b4780bd2… was cancelled in the app
    // (restore applied 07:37:53), set back to preparing 07:37:54 and delivered
    // 07:44 — its ledger nets to 0 and no order_redeplete audit row exists.
    storedOrder = { id: ORDER_ID, tenant_id: 't1', outlet_id: null, status: 'preparing', customer_data: {} }
    const { POST } = await import('@/app/api/inventory/order-stock/route')

    const res = await POST(post({ tenantId: 't1', orderId: ORDER_ID, action: 'redeplete' }))

    expect(res.status).toBe(200)
    expect(redepleteMock).toHaveBeenCalledWith('t1', ORDER_ID, expect.anything())
  })
})

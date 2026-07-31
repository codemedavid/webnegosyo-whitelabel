/**
 * @jest-environment node
 *
 * `POST /api/inventory/customer-order-stock`.
 *
 * The customer app has no account, so this route cannot be gated on a merchant
 * session the way `/api/inventory/order-stock` is. It is guarded by taking
 * nothing steerable instead: the caller names a tenant and an order, and every
 * line, dish and quantity is read back out of the order the platform already
 * holds. The worst a forged call can do is trigger the depletion that order had
 * already earned, once — the ledger's order+direction guard covers the rest.
 */
import { NextRequest } from 'next/server'

const from = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (...args: unknown[]) => from(...args) }),
}))

const applyOrderStockBestEffort = jest.fn()
jest.mock('@/lib/inventory/order-stock-service', () => ({
  applyOrderStockBestEffort: (...args: unknown[]) => applyOrderStockBestEffort(...args),
}))

import { POST } from '@/app/api/inventory/customer-order-stock/route'

const TENANT = '11111111-1111-1111-1111-111111111111'
const ORDER = '22222222-2222-2222-2222-222222222222'

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/inventory/customer-order-stock', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** The tenant row lookup, then the order lookup, then its lines. */
function stubTables(options: {
  inventoryEnabled?: boolean
  order?: { tenant_id: string; outlet_id?: string | null } | null
  lines?: Array<{ menu_item_id: string | null; quantity: number }>
}) {
  from.mockImplementation((table: string) => {
    if (table === 'tenants') {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: { inventory_enabled: options.inventoryEnabled ?? true },
                error: null,
              }),
          }),
        }),
      }
    }
    if (table === 'orders') {
      // `order: null` means "no such order" and must not fall through to the
      // default the way `??` would.
      const order =
        'order' in options ? options.order : { tenant_id: TENANT, outlet_id: null }
      return {
        select: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: order, error: null }) }),
        }),
      }
    }
    if (table === 'order_items') {
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: options.lines ?? [], error: null }),
        }),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })
}

beforeEach(() => {
  from.mockReset()
  applyOrderStockBestEffort.mockReset()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('customer order stock route', () => {
  it('spends the lines the order actually recorded', async () => {
    stubTables({ lines: [{ menu_item_id: 'dish-1', quantity: 2 }] })

    const response = await POST(post({ tenantId: TENANT, orderId: ORDER }))

    expect(response.status).toBe(200)
    expect(applyOrderStockBestEffort).toHaveBeenCalledWith(
      TENANT,
      ORDER,
      [{ menuItemId: 'dish-1', quantity: 2 }],
      'sale',
      0,
      null,
    )
  })

  it('ignores any lines the caller tries to send', async () => {
    // The whole safety argument rests on this: a payload with items in it must
    // not be able to spend a shelf the order never touched.
    stubTables({ lines: [{ menu_item_id: 'dish-1', quantity: 1 }] })

    await POST(
      post({
        tenantId: TENANT,
        orderId: ORDER,
        items: [{ menuItemId: 'expensive-dish', quantity: 9999 }],
      }),
    )

    expect(applyOrderStockBestEffort).toHaveBeenCalledWith(
      TENANT,
      ORDER,
      [{ menuItemId: 'dish-1', quantity: 1 }],
      'sale',
      0,
      null,
    )
  })

  it('spends the branch recorded on the order', async () => {
    // The branch is as unsteerable as the lines: it comes off the stored order,
    // so a forged call cannot deplete a shop the order never visited.
    stubTables({
      order: { tenant_id: TENANT, outlet_id: 'outlet-north' },
      lines: [{ menu_item_id: 'dish-1', quantity: 1 }],
    })

    await POST(post({ tenantId: TENANT, orderId: ORDER, outletId: 'outlet-south' }))

    expect(applyOrderStockBestEffort).toHaveBeenCalledWith(
      TENANT,
      ORDER,
      [{ menuItemId: 'dish-1', quantity: 1 }],
      'sale',
      0,
      'outlet-north',
    )
  })

  it('refuses an order belonging to another tenant', async () => {
    stubTables({
      order: { tenant_id: '33333333-3333-3333-3333-333333333333' },
      lines: [{ menu_item_id: 'dish-1', quantity: 1 }],
    })

    const response = await POST(post({ tenantId: TENANT, orderId: ORDER }))

    expect(response.status).toBe(404)
    expect(applyOrderStockBestEffort).not.toHaveBeenCalled()
  })

  it('refuses an order that does not exist', async () => {
    stubTables({ order: null })

    const response = await POST(post({ tenantId: TENANT, orderId: ORDER }))

    expect(response.status).toBe(404)
    expect(applyOrderStockBestEffort).not.toHaveBeenCalled()
  })

  it('skips silently for a tenant who never switched inventory on', async () => {
    // Same gate `createOrderAction` applies — a tenant must never accumulate a
    // ledger they did not ask for. Reported as success: nothing is wrong, and
    // the customer app must not surface a stock concern to a diner.
    stubTables({ inventoryEnabled: false, lines: [{ menu_item_id: 'dish-1', quantity: 1 }] })

    const response = await POST(post({ tenantId: TENANT, orderId: ORDER }))

    expect(response.status).toBe(200)
    expect(applyOrderStockBestEffort).not.toHaveBeenCalled()
  })

  it('rejects a request naming no order', async () => {
    const response = await POST(post({ tenantId: TENANT }))

    expect(response.status).toBe(400)
    expect(applyOrderStockBestEffort).not.toHaveBeenCalled()
  })

  it('reports success even when the ledger write fails', async () => {
    // The order is already placed and the customer is looking at a confirmation.
    // A stock failure must never turn that into an error they cannot act on.
    stubTables({ lines: [{ menu_item_id: 'dish-1', quantity: 1 }] })
    applyOrderStockBestEffort.mockRejectedValueOnce(new Error('ledger down'))

    const response = await POST(post({ tenantId: TENANT, orderId: ORDER }))

    expect(response.status).toBe(200)
  })
})

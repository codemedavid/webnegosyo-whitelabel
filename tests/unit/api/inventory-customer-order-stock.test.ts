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

const convexQuery = jest.fn()
const createConvexServerClient = jest.fn((..._args: unknown[]) => ({ query: convexQuery }))
jest.mock('@/lib/convex/server', () => ({
  createConvexServerClient: (...args: unknown[]) => createConvexServerClient(...args),
}))

const rateLimit = jest.fn()
jest.mock('@/lib/distributed-rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => rateLimit(...args),
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
  tenant?: Record<string, unknown>
  order?: { tenant_id: string; outlet_id?: string | null; source?: string; created_at?: string; status?: string; payment_status?: string | null } | null
  lines?: Array<{ menu_item_id: string | null; quantity: number }>
}) {
  from.mockImplementation((table: string) => {
    // The route reads the flag + deployment URL off tenants and the deploy key
    // off tenant_secrets; the fixture keeps them in one object for the tests.
    const tenant = {
      inventory_enabled: options.inventoryEnabled ?? true,
      order_backend: null,
      convex_deployment_url: null,
      convex_deploy_key: null,
      ...(options.tenant ?? {}),
    }
    if (table === 'tenants') {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: {
                  inventory_enabled: tenant.inventory_enabled,
                  order_backend: tenant.order_backend,
                  convex_deployment_url: tenant.convex_deployment_url,
                },
                error: null,
              }),
          }),
        }),
      }
    }
    if (table === 'tenant_secrets') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { convex_deploy_key: tenant.convex_deploy_key },
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
        'order' in options ? options.order : { tenant_id: TENANT, outlet_id: null, source: 'web', created_at: new Date().toISOString() }
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
  convexQuery.mockReset()
  rateLimit.mockReset()
  rateLimit.mockResolvedValue({ allowed: true, remaining: 10, retryAfterSec: 30 })
  createConvexServerClient.mockClear()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
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
      { context: { source: 'customer_app' } },
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
      { context: { source: 'customer_app' } },
    )
  })

  it('spends the branch recorded on the order', async () => {
    // The branch is as unsteerable as the lines: it comes off the stored order,
    // so a forged call cannot deplete a shop the order never visited.
    stubTables({
      order: { tenant_id: TENANT, outlet_id: 'outlet-north', source: 'web', created_at: new Date().toISOString() },
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
      { context: { source: 'customer_app' } },
    )
  })

  it.each([
    ['cancelled', null],
    ['pending', 'refunded'],
  ])('spends nothing for an order already %s / %s', async (status, paymentStatus) => {
    // The sweep skips finished orders; so must this public route, or a call
    // after a quick cancel sells stock for an order that never happened.
    stubTables({
      order: { tenant_id: TENANT, outlet_id: null, source: 'web', created_at: new Date().toISOString(), status, payment_status: paymentStatus },
      lines: [{ menu_item_id: 'dish-1', quantity: 1 }],
    })

    const response = await POST(post({ tenantId: TENANT, orderId: ORDER }))

    expect(await response.json()).toEqual({ success: true, skipped: 'order_not_eligible' })
    expect(applyOrderStockBestEffort).not.toHaveBeenCalled()
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

describe('customer order stock route — Convex-backend tenants', () => {
  // These tenants hold their orders in a per-tenant Convex deployment, not the
  // platform `orders` table. The trust boundary is the same: the caller still
  // names only a tenant and an order, and the platform reads the lines back —
  // just out of that tenant's own deployment, server-side, with the deploy key
  // only the platform holds.
  const CONVEX_ORDER = 'j57abc123'
  const CONVEX_TENANT = {
    convex_deployment_url: 'https://happy-otter-123.convex.cloud',
    convex_deploy_key: 'prod:deploy-key',
  }

  it('reads the lines out of the tenant Convex deployment and spends them', async () => {
    stubTables({ tenant: CONVEX_TENANT })
    convexQuery.mockResolvedValueOnce({
      _id: CONVEX_ORDER,
      source: 'mobile',
      _creationTime: Date.now(),
      outletId: undefined,
      items: [
        { menuItemId: 'dish-1', quantity: 2 },
        { menuItemId: 'dish-2', quantity: 1 },
      ],
    })

    const response = await POST(post({ tenantId: TENANT, orderId: CONVEX_ORDER }))

    expect(response.status).toBe(200)
    expect(createConvexServerClient).toHaveBeenCalledWith(
      CONVEX_TENANT.convex_deployment_url,
      CONVEX_TENANT.convex_deploy_key,
    )
    expect(convexQuery).toHaveBeenCalledWith('orders:getOrderByIdInternal', {
      orderId: CONVEX_ORDER,
    })
    expect(applyOrderStockBestEffort).toHaveBeenCalledWith(
      TENANT,
      CONVEX_ORDER,
      [
        { menuItemId: 'dish-1', quantity: 2 },
        { menuItemId: 'dish-2', quantity: 1 },
      ],
      'sale',
      0,
      null,
      { context: { source: 'customer_app' } },
    )
  })

  it('ignores any lines the caller tries to send', async () => {
    // Identical safety argument to the platform path: a forged payload with
    // items in it must not be able to spend a shelf the order never touched.
    stubTables({ tenant: CONVEX_TENANT })
    convexQuery.mockResolvedValueOnce({
      _id: CONVEX_ORDER,
      source: 'mobile',
      _creationTime: Date.now(),
      items: [{ menuItemId: 'dish-1', quantity: 1 }],
    })

    await POST(
      post({
        tenantId: TENANT,
        orderId: CONVEX_ORDER,
        items: [{ menuItemId: 'expensive-dish', quantity: 9999 }],
      }),
    )

    expect(applyOrderStockBestEffort).toHaveBeenCalledWith(
      TENANT,
      CONVEX_ORDER,
      [{ menuItemId: 'dish-1', quantity: 1 }],
      'sale',
      0,
      null,
      { context: { source: 'customer_app' } },
    )
  })

  it('spends the branch recorded on the Convex order, never the payload', async () => {
    stubTables({ tenant: CONVEX_TENANT })
    convexQuery.mockResolvedValueOnce({
      _id: CONVEX_ORDER,
      source: 'mobile',
      _creationTime: Date.now(),
      outletId: 'outlet-north',
      items: [{ menuItemId: 'dish-1', quantity: 1 }],
    })

    await POST(
      post({ tenantId: TENANT, orderId: CONVEX_ORDER, outletId: 'outlet-south' }),
    )

    expect(applyOrderStockBestEffort).toHaveBeenCalledWith(
      TENANT,
      CONVEX_ORDER,
      [{ menuItemId: 'dish-1', quantity: 1 }],
      'sale',
      0,
      'outlet-north',
      { context: { source: 'customer_app' } },
    )
  })

  it('refuses an order the deployment does not hold', async () => {
    stubTables({ tenant: CONVEX_TENANT })
    convexQuery.mockResolvedValueOnce(null)

    const response = await POST(post({ tenantId: TENANT, orderId: CONVEX_ORDER }))

    expect(response.status).toBe(404)
    expect(applyOrderStockBestEffort).not.toHaveBeenCalled()
  })

  it('skips silently when the deployment has no deploy key to read with', async () => {
    // Graceful degradation, not an error: a half-configured tenant must not
    // surface a stock concern to a diner. Depleting nothing is what this path
    // did for every Convex tenant before it existed.
    stubTables({
      tenant: { ...CONVEX_TENANT, convex_deploy_key: null },
    })

    const response = await POST(post({ tenantId: TENANT, orderId: CONVEX_ORDER }))

    expect(response.status).toBe(200)
    expect(createConvexServerClient).not.toHaveBeenCalled()
    expect(applyOrderStockBestEffort).not.toHaveBeenCalled()
  })

  it('still gates on the tenant having inventory switched on', async () => {
    stubTables({ inventoryEnabled: false, tenant: CONVEX_TENANT })

    const response = await POST(post({ tenantId: TENANT, orderId: CONVEX_ORDER }))

    expect(response.status).toBe(200)
    expect(convexQuery).not.toHaveBeenCalled()
    expect(applyOrderStockBestEffort).not.toHaveBeenCalled()
  })

  it('reports success even when the deployment cannot be reached', async () => {
    // The order is placed and the customer is on the confirmation screen. A
    // stock failure must never turn that into an error they cannot act on.
    stubTables({ tenant: CONVEX_TENANT })
    convexQuery.mockRejectedValueOnce(new Error('deployment unreachable'))

    const response = await POST(post({ tenantId: TENANT, orderId: CONVEX_ORDER }))

    expect(response.status).toBe(200)
    expect(applyOrderStockBestEffort).not.toHaveBeenCalled()
  })
})

describe('customer order stock route — backend comes from resolveOrderBackend', () => {
  // A store pinned to the platform database can still carry a Convex URL from
  // an earlier setup. Its orders live on the platform, so routing on the URL
  // read a deployment that never saw the order and the sale was never spent.
  it('spends a platform-pinned order from the platform table despite a stale Convex URL', async () => {
    stubTables({
      tenant: {
        order_backend: 'platform',
        convex_deployment_url: 'https://stale-otter-1.convex.cloud',
        convex_deploy_key: 'prod:stale',
      },
      lines: [{ menu_item_id: 'dish-1', quantity: 1 }],
    })

    const response = await POST(post({ tenantId: TENANT, orderId: ORDER }))

    expect(response.status).toBe(200)
    expect(createConvexServerClient).not.toHaveBeenCalled()
    expect(applyOrderStockBestEffort).toHaveBeenCalledWith(
      TENANT, ORDER, [{ menuItemId: 'dish-1', quantity: 1 }], 'sale', 0, null,
      { context: { source: 'customer_app' } },
    )
  })

  it("spends a stale 'supabase' pin (the retired own-project backend) from the platform table, like auto", async () => {
    stubTables({
      tenant: { order_backend: 'supabase', convex_deployment_url: null },
      lines: [{ menu_item_id: 'dish-1', quantity: 1 }],
    })

    const response = await POST(post({ tenantId: TENANT, orderId: ORDER }))

    expect(response.status).toBe(200)
    expect(createConvexServerClient).not.toHaveBeenCalled()
    expect(applyOrderStockBestEffort).toHaveBeenCalledWith(
      TENANT, ORDER, [{ menuItemId: 'dish-1', quantity: 1 }], 'sale', 0, null,
      { context: { source: 'customer_app' } },
    )
  })
})

describe('customer order stock route — only the order the app just placed', () => {
  const MINUTE = 60_000
  const placed = (agoMs: number, source = 'web') => ({
    tenant_id: TENANT, outlet_id: null, source, created_at: new Date(Date.now() - agoMs).toISOString(),
  })
  const lines = [{ menu_item_id: 'dish-1', quantity: 1 }]

  it('spends an order placed a minute ago', async () => {
    stubTables({ order: placed(MINUTE), lines })
    await POST(post({ tenantId: TENANT, orderId: ORDER }))
    expect(applyOrderStockBestEffort).toHaveBeenCalledTimes(1)
  })

  it('leaves an order from last week alone', async () => {
    stubTables({ order: placed(7 * 24 * 60 * MINUTE), lines })
    const response = await POST(post({ tenantId: TENANT, orderId: ORDER }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, skipped: 'order_not_eligible' })
    expect(applyOrderStockBestEffort).not.toHaveBeenCalled()
  })

  it.each(['pos', 'qr_handoff'])('leaves a %s order to its own stock call', async (source) => {
    stubTables({ order: placed(MINUTE, source), lines })
    await POST(post({ tenantId: TENANT, orderId: ORDER }))
    expect(applyOrderStockBestEffort).not.toHaveBeenCalled()
  })

  it('refuses to spend more units than any real cart holds', async () => {
    stubTables({ order: placed(MINUTE), lines: [{ menu_item_id: 'dish-1', quantity: 400 }, { menu_item_id: 'dish-2', quantity: 400 }] })
    await POST(post({ tenantId: TENANT, orderId: ORDER }))
    expect(applyOrderStockBestEffort).not.toHaveBeenCalled()
  })

  it('answers 429 and reads nothing once an address is over its allowance', async () => {
    rateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 12 })
    stubTables({ order: placed(MINUTE), lines })
    const response = await POST(post({ tenantId: TENANT, orderId: ORDER }))
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('12')
    expect(from).not.toHaveBeenCalled()
  })

  it('counts each order on its own allowance too', async () => {
    rateLimit.mockResolvedValueOnce({ allowed: true, remaining: 5, retryAfterSec: 30 })
    rateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 40 })
    stubTables({ order: placed(MINUTE), lines })
    const response = await POST(post({ tenantId: TENANT, orderId: ORDER }))
    expect(response.status).toBe(429)
    expect(rateLimit.mock.calls[1][0]).toBe(`customer-order-stock:order:${ORDER}`)
  })

  it('only the customer app source counts on a Convex deployment', async () => {
    stubTables({ tenant: { convex_deployment_url: 'https://x.convex.cloud', convex_deploy_key: 'k' } })
    convexQuery.mockResolvedValueOnce({ _id: 'j1', source: 'pos', _creationTime: Date.now(), items: [{ menuItemId: 'dish-1', quantity: 1 }] })
    await POST(post({ tenantId: TENANT, orderId: 'j1' }))
    expect(applyOrderStockBestEffort).not.toHaveBeenCalled()
  })

  it('leaves an old Convex order alone', async () => {
    stubTables({ tenant: { convex_deployment_url: 'https://x.convex.cloud', convex_deploy_key: 'k' } })
    convexQuery.mockResolvedValueOnce({ _id: 'j1', source: 'mobile', _creationTime: Date.now() - 3 * 60 * 60 * 1000, items: [{ menuItemId: 'dish-1', quantity: 1 }] })
    await POST(post({ tenantId: TENANT, orderId: 'j1' }))
    expect(applyOrderStockBestEffort).not.toHaveBeenCalled()
  })
})

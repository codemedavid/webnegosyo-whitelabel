/**
 * @jest-environment node
 *
 * `POST /api/loyverse` — the merchant app's entry point for pushing a confirmed
 * order into Loyverse as a sales receipt.
 *
 * The app surfaces that confirm an order in bulk (the orders list, the register
 * drawer) hold no line items — a list row carries a total and an item COUNT,
 * not the dishes. So they can only name an order, and the server has to resolve
 * the lines itself: from the platform `orders` table, or, for a Convex-backend
 * tenant, out of that tenant's own deployment with the deploy key only the
 * platform holds.
 */
import { NextRequest } from 'next/server'

const adminFrom = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (...args: unknown[]) => adminFrom(...args) }),
}))

const authFrom = jest.fn()
const getUser = jest.fn()
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: () => getUser() },
    from: (...args: unknown[]) => authFrom(...args),
  }),
}))

const pushOrderToLoyverseBestEffort = jest.fn()
jest.mock('@/lib/loyverse/push-service', () => ({
  pushOrderToLoyverseBestEffort: (...args: unknown[]) =>
    pushOrderToLoyverseBestEffort(...args),
}))

const convexQuery = jest.fn()
const createConvexServerClient = jest.fn(() => ({ query: convexQuery }))
jest.mock('@/lib/convex/server', () => ({
  createConvexServerClient: (...args: unknown[]) => createConvexServerClient(...args),
}))

import { POST } from '@/app/api/loyverse/route'

const TENANT = '11111111-1111-1111-1111-111111111111'
const PLATFORM_ORDER = '22222222-2222-2222-2222-222222222222'
const CONVEX_ORDER = 'k1234567890abcdef'

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/loyverse', {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

/**
 * The admin-key reads: the platform `orders` row (present only for a
 * platform-backend order) and the tenant's Convex credentials.
 */
function stubAdmin(options: {
  platformOrder?: { id: string } | null
  tenant?: Record<string, unknown> | null
}) {
  adminFrom.mockImplementation((table: string) => {
    if (table === 'orders') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: options.platformOrder ?? null, error: null }),
            }),
          }),
        }),
      }
    }
    if (table === 'tenants') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data:
                  'tenant' in options
                    ? options.tenant
                    : { convex_deployment_url: 'https://t.convex.cloud', convex_deploy_key: 'key' },
                error: null,
              }),
          }),
        }),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  authFrom.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({ data: { role: 'admin', tenant_id: TENANT }, error: null }),
      }),
    }),
  }))
  pushOrderToLoyverseBestEffort.mockResolvedValue({
    success: true,
    skipped: false,
    receiptNumber: 'R-1',
    unmapped: [],
  })
  convexQuery.mockResolvedValue(null)
})

describe('POST /api/loyverse — Convex order resolved by id alone', () => {
  it('reads the order lines out of the tenant deployment when the app sends only an orderId', async () => {
    stubAdmin({ platformOrder: null })
    convexQuery.mockResolvedValue({
      items: [
        {
          menuItemId: 'mi-1',
          menuItemName: 'Americano',
          quantity: 2,
          price: 120,
          subtotal: 240,
        },
      ],
    })

    const response = await POST(post({ tenantId: TENANT, orderId: CONVEX_ORDER }))

    expect(response.status).toBe(200)
    expect(createConvexServerClient).toHaveBeenCalledWith('https://t.convex.cloud', 'key')
    expect(convexQuery).toHaveBeenCalledWith('orders:getOrderById', { orderId: CONVEX_ORDER })
    expect(pushOrderToLoyverseBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        // No platform row exists, so nothing can record the outcome — the
        // once-only guarantee is the confirm transition that triggered this.
        orderId: null,
        trigger: 'confirm',
        items: [
          expect.objectContaining({ menu_item_id: 'mi-1', quantity: 2, price: 120 }),
        ],
      }),
    )
  })

  it('does not reach for Convex when the order is a platform row', async () => {
    stubAdmin({ platformOrder: { id: PLATFORM_ORDER } })

    await POST(post({ tenantId: TENANT, orderId: PLATFORM_ORDER }))

    expect(createConvexServerClient).not.toHaveBeenCalled()
    expect(pushOrderToLoyverseBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: PLATFORM_ORDER, items: [] }),
    )
  })

  it('prefers caller-supplied items over a Convex round trip', async () => {
    // The order-detail screen already holds the lines it is displaying; making
    // it pay for a second read would be pure latency on the confirm tap.
    stubAdmin({ platformOrder: null })
    const items = [
      {
        menu_item_id: 'mi-9',
        menu_item_name: 'Latte',
        addons: [],
        quantity: 1,
        price: 150,
        subtotal: 150,
      },
    ]

    await POST(post({ tenantId: TENANT, orderId: CONVEX_ORDER, items }))

    expect(convexQuery).not.toHaveBeenCalled()
    expect(pushOrderToLoyverseBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({ items }),
    )
  })

  it('reports a skip instead of 404 when the tenant has no Convex deployment', async () => {
    // Neither backend holds this order (a tenant-Supabase tenant, or a stale
    // id). A confirm must not surface an error the merchant cannot act on.
    stubAdmin({ platformOrder: null, tenant: { convex_deployment_url: null, convex_deploy_key: null } })

    const response = await POST(post({ tenantId: TENANT, orderId: CONVEX_ORDER }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.skipped).toBe(true)
    expect(pushOrderToLoyverseBestEffort).not.toHaveBeenCalled()
  })

  it('reports a skip when the deployment cannot be reached', async () => {
    stubAdmin({ platformOrder: null })
    convexQuery.mockRejectedValue(new Error('deployment unreachable'))

    const response = await POST(post({ tenantId: TENANT, orderId: CONVEX_ORDER }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.skipped).toBe(true)
    expect(pushOrderToLoyverseBestEffort).not.toHaveBeenCalled()
  })

  it('reports a skip when the deployment has no such order', async () => {
    stubAdmin({ platformOrder: null })
    convexQuery.mockResolvedValue(null)

    const response = await POST(post({ tenantId: TENANT, orderId: CONVEX_ORDER }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.skipped).toBe(true)
    expect(pushOrderToLoyverseBestEffort).not.toHaveBeenCalled()
  })
})

describe('POST /api/loyverse — authorization is unchanged', () => {
  it('rejects a caller with no bearer token', async () => {
    const request = new NextRequest('http://localhost/api/loyverse', {
      method: 'POST',
      body: JSON.stringify({ tenantId: TENANT, orderId: CONVEX_ORDER }),
    })

    expect((await POST(request)).status).toBe(401)
  })

  it('rejects an admin of a different tenant', async () => {
    authFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({ data: { role: 'admin', tenant_id: 'other' }, error: null }),
        }),
      }),
    }))

    expect((await POST(post({ tenantId: TENANT, orderId: CONVEX_ORDER }))).status).toBe(403)
  })

  it('never queries Convex before authorization passes', async () => {
    // The deploy key is read with the service key; reaching for it before the
    // caller is authorised would make the route an unauthenticated order reader.
    stubAdmin({ platformOrder: null })
    getUser.mockResolvedValue({ data: { user: null } })

    await POST(post({ tenantId: TENANT, orderId: CONVEX_ORDER }))

    expect(convexQuery).not.toHaveBeenCalled()
    expect(adminFrom).not.toHaveBeenCalled()
  })
})

describe('POST /api/loyverse — POS counter sales', () => {
  it('pushes a tendered sale regardless of the tenant push mode', async () => {
    const items = [
      {
        menu_item_id: 'mi-1',
        menu_item_name: 'Americano',
        addons: [],
        quantity: 1,
        price: 120,
        subtotal: 120,
      },
    ]

    await POST(post({ tenantId: TENANT, items, orderNumber: '#42', context: 'pos_sale' }))

    expect(pushOrderToLoyverseBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'manual', orderNumber: '#42' }),
    )
  })
})

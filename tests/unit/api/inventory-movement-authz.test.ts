/**
 * @jest-environment node
 *
 * POST /api/inventory/movement — a staff grant has to hold at the door.
 *
 * The route authorized on ROLE alone: `role === 'admin' && tenant_id matches`.
 * In this codebase every staff member of a tenant is `role='admin'` — that was
 * the deliberate choice recorded in the staff-management work, because a new
 * role string would have had to be taught to every existing admin check — and
 * per-feature reach lives in `app_users.permissions` instead.
 *
 * So a cashier holding only the `pos` grant passed this check. The web sidebar
 * hides inventory from them and the merchant app does not register the tab, but
 * neither of those is a boundary: both are UI, and this route is reachable with
 * the access token the app already holds. A cashier could receive stock, record
 * waste, and enter a stocktake — the last of which rewrites the shelf figure and
 * shows up in the daily report as someone else's shrinkage.
 *
 * The permission checked is `menu`, the same key that gates the inventory tab
 * and the web sidebar entry, so the door and the UI now agree.
 */

import { NextRequest } from 'next/server'

import { POST } from '@/app/api/inventory/movement/route'

const recordStockMovementWith = jest.fn(() =>
  Promise.resolve({ movement: { id: 'mv1' }, item: { id: 'i1' } }),
)

jest.mock('@/lib/inventory/stock-service', () => ({
  recordStockMovementWith: (...args: unknown[]) => recordStockMovementWith(...(args as [])),
}))

const TENANT = 'tenant-1'

interface AppUserRow {
  role: string
  tenant_id: string | null
  permissions?: string[] | null
  is_owner?: boolean | null
}

let appUser: AppUserRow | null = null

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        single: async () =>
          table === 'app_users'
            ? { data: appUser, error: null }
            : { data: { inventory_enabled: true }, error: null },
      }
      return chain
    },
  }),
}))

function movementRequest(extra: Record<string, unknown> = {}): NextRequest {
  return new NextRequest('http://localhost/api/inventory/movement', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify({
      tenantId: TENANT,
      inventory_item_id: 'item-1',
      reason: 'stocktake',
      quantity: 900,
      unit_id: 'unit-1',
      ...extra,
    }),
  })
}

async function post(user: AppUserRow | null, extra: Record<string, unknown> = {}) {
  appUser = user
  recordStockMovementWith.mockClear()
  return POST(movementRequest(extra))
}

describe('POST /api/inventory/movement — which branch the stock moves at', () => {
  const OWNER = { role: 'admin', tenant_id: TENANT, permissions: null, is_owner: true }

  test('forwards the branch the caller chose', async () => {
    // The route built its input object without `outlet_id` at all, so the
    // choice was silently dropped. `resolveMovementBranch` is what makes
    // accepting it safe — a manager naming somebody else-s shop is refused —
    // and a store-wide owner receiving a delivery into North is an ordinary
    // thing to do. Without this an owner could only ever record into the
    // unbranched pool, so their deliveries and their manager-s piled up in two
    // different places for the same physical shelf.
    await post(OWNER as never, { outletId: 'outlet-north' })

    expect(recordStockMovementWith).toHaveBeenCalledWith(
      expect.anything(),
      TENANT,
      expect.objectContaining({ outlet_id: 'outlet-north' }),
    )
  })

  test('sends nothing when no branch was named, leaving the service to decide', async () => {
    await post(OWNER as never)

    expect(recordStockMovementWith).toHaveBeenCalledWith(
      expect.anything(),
      TENANT,
      expect.objectContaining({ outlet_id: undefined }),
    )
  })

  test('ignores a branch that is not a string rather than passing it on', async () => {
    await post(OWNER as never, { outletId: { id: 'outlet-north' } })

    expect(recordStockMovementWith).toHaveBeenCalledWith(
      expect.anything(),
      TENANT,
      expect.objectContaining({ outlet_id: undefined }),
    )
  })
})

describe('POST /api/inventory/movement — who may move stock', () => {
  test('refuses a staff member who does not hold the menu grant', async () => {
    // Arrange — a cashier. Same role as the owner; only the grants differ.
    const response = await post({
      role: 'admin',
      tenant_id: TENANT,
      permissions: ['pos', 'orders'],
      is_owner: false,
    })

    // Assert — and, critically, nothing was written.
    expect(response.status).toBe(403)
    expect(recordStockMovementWith).not.toHaveBeenCalled()
  })

  test('admits a staff member who holds the menu grant', async () => {
    const response = await post({
      role: 'admin',
      tenant_id: TENANT,
      permissions: ['menu'],
      is_owner: false,
    })

    expect(response.status).toBe(200)
    expect(recordStockMovementWith).toHaveBeenCalled()
  })

  test('admits the owner regardless of the grants on their row', async () => {
    // An owner's reach does not depend on the permission array.
    const response = await post({
      role: 'admin',
      tenant_id: TENANT,
      permissions: [],
      is_owner: true,
    })

    expect(response.status).toBe(200)
  })

  test('admits a legacy admin whose permissions were never set', async () => {
    // `permissions: null` predates staff management and means full access.
    // Treating it as "no grants" would lock every pre-existing merchant out of
    // their own inventory.
    const response = await post({
      role: 'admin',
      tenant_id: TENANT,
      permissions: null,
      is_owner: false,
    })

    expect(response.status).toBe(200)
  })

  test('admits a superadmin', async () => {
    const response = await post({ role: 'superadmin', tenant_id: null, permissions: [] })

    expect(response.status).toBe(200)
  })

  test('still refuses an admin of another tenant', async () => {
    // The pre-existing boundary must survive the new one.
    const response = await post({
      role: 'admin',
      tenant_id: 'someone-else',
      permissions: ['menu'],
      is_owner: true,
    })

    expect(response.status).toBe(403)
    expect(recordStockMovementWith).not.toHaveBeenCalled()
  })

  test('refuses a caller with no app_users row at all', async () => {
    const response = await post(null)

    expect(response.status).toBe(403)
    expect(recordStockMovementWith).not.toHaveBeenCalled()
  })
})

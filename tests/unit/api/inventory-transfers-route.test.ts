/**
 * @jest-environment node
 *
 * POST /api/inventory/transfers — moving stock between shops from the phone.
 *
 * The web admin has had transfers since phase 3, but the merchant app has not:
 * the person actually standing at the receiving bench with the box in front of
 * them could see a branch shelf and record a delivery, and could not count in a
 * transfer. That is backwards — receiving is the step that most wants a phone,
 * and the one the whole document exists for.
 *
 * **Why a route rather than a direct table write.** The app cannot call server
 * actions, and RLS would happily let it insert `stock_movements` itself. But a
 * transfer is two ledger legs that must agree, a status transition that stops a
 * stale screen sending twice, and a source unit cost frozen at send time. A
 * direct insert from a phone would get all three wrong, one leg at a time.
 *
 * **Why the service needed a seam.** `createTransfer` and friends built their
 * own cookie-based server client. The app authenticates with a Bearer token, so
 * a cookie client here resolves no session at all — and `resolveActingBranchScope`
 * would then be deciding branch authority for nobody. The `...With` variants
 * take the caller's own client, exactly as `recordStockMovementWith` already
 * does, which keeps the authority check running against the real caller.
 */

import { NextRequest } from 'next/server'

import { POST } from '@/app/api/inventory/transfers/route'

const createTransferWith = jest.fn(() => Promise.resolve({ id: 'tr1' }))
const sendTransferWith = jest.fn(() => Promise.resolve())
const receiveTransferWith = jest.fn(() => Promise.resolve())
const cancelTransferWith = jest.fn(() => Promise.resolve())

jest.mock('@/lib/inventory/stock-transfers-service', () => ({
  createTransferWith: (...args: unknown[]) => createTransferWith(...(args as [])),
  sendTransferWith: (...args: unknown[]) => sendTransferWith(...(args as [])),
  receiveTransferWith: (...args: unknown[]) => receiveTransferWith(...(args as [])),
  cancelTransferWith: (...args: unknown[]) => cancelTransferWith(...(args as [])),
}))

const TENANT = 'tenant-1'

interface AppUserRow {
  role: string
  tenant_id: string | null
  permissions?: string[] | null
  is_owner?: boolean | null
}

let appUser: AppUserRow | null = null
let authedUser: { id: string } | null = { id: 'u1' }
let inventoryEnabled = true

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: authedUser }, error: null }) },
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        single: async () =>
          table === 'app_users'
            ? { data: appUser, error: null }
            : { data: { inventory_enabled: inventoryEnabled }, error: null },
      }
      return chain
    },
  }),
}))

const OWNER = { role: 'admin', tenant_id: TENANT, permissions: null, is_owner: true }
const CASHIER = { role: 'admin', tenant_id: TENANT, permissions: ['pos'], is_owner: false }

function transferRequest(body: Record<string, unknown>, withAuth = true): NextRequest {
  return new NextRequest('http://localhost/api/inventory/transfers', {
    method: 'POST',
    headers: withAuth
      ? { authorization: 'Bearer token', 'content-type': 'application/json' }
      : { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantId: TENANT, ...body }),
  })
}

async function post(
  user: AppUserRow | null,
  body: Record<string, unknown>,
  options: { withAuth?: boolean } = {},
) {
  appUser = user
  authedUser = { id: 'u1' }
  inventoryEnabled = true
  createTransferWith.mockClear()
  sendTransferWith.mockClear()
  receiveTransferWith.mockClear()
  cancelTransferWith.mockClear()
  return POST(transferRequest(body, options.withAuth ?? true))
}

const DRAFT = {
  action: 'create',
  fromOutletId: 'north',
  toOutletId: 'south',
  lines: [{ inventoryItemId: 'flour', quantity: 20 }],
}

describe('POST /api/inventory/transfers — the four steps', () => {
  test('drafts a transfer', async () => {
    const response = await post(OWNER, DRAFT)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, id: 'tr1' })
    expect(createTransferWith).toHaveBeenCalledTimes(1)
  })

  test('sends one', async () => {
    const response = await post(OWNER, { action: 'send', transferId: 'tr1' })

    expect(response.status).toBe(200)
    expect(sendTransferWith).toHaveBeenCalledTimes(1)
  })

  test('counts one in with what was actually on the bench', async () => {
    // The counts are the entire reason the receive step exists. A route that
    // dropped them would silently assume every load arrived intact.
    await post(OWNER, { action: 'receive', transferId: 'tr1', counts: { flour: 12 } })

    const [, , , counts] = receiveTransferWith.mock.calls[0] as unknown[]
    expect(counts).toEqual({ flour: 12 })
  })

  test('cancels a draft', async () => {
    const response = await post(OWNER, { action: 'cancel', transferId: 'tr1' })

    expect(response.status).toBe(200)
    expect(cancelTransferWith).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/inventory/transfers — who may reach it', () => {
  test('refuses a caller with no token', async () => {
    const response = await post(OWNER, DRAFT, { withAuth: false })

    expect(response.status).toBe(401)
    expect(createTransferWith).not.toHaveBeenCalled()
  })

  test('refuses a cashier holding only the register grant', async () => {
    // Every staff member here is `role='admin'`, so role alone is not a
    // boundary — reach lives in `permissions`. A cashier who could send a
    // transfer could empty their own shop's shelf onto another's book.
    const response = await post(CASHIER, DRAFT)

    expect(response.status).toBe(403)
    expect(createTransferWith).not.toHaveBeenCalled()
  })

  test('refuses a member of another store', async () => {
    const response = await post({ ...OWNER, tenant_id: 'other-tenant' }, DRAFT)

    expect(response.status).toBe(403)
    expect(createTransferWith).not.toHaveBeenCalled()
  })

  test('refuses when the store has not switched inventory on', async () => {
    appUser = OWNER
    authedUser = { id: 'u1' }
    inventoryEnabled = false
    createTransferWith.mockClear()

    const response = await POST(transferRequest(DRAFT))

    expect(response.status).toBe(409)
    expect(createTransferWith).not.toHaveBeenCalled()
  })
})

describe('POST /api/inventory/transfers — bad input', () => {
  test('refuses an action it does not know', async () => {
    const response = await post(OWNER, { action: 'destroy', transferId: 'tr1' })

    expect(response.status).toBe(400)
  })

  test('refuses a step that names no transfer', async () => {
    const response = await post(OWNER, { action: 'send' })

    expect(response.status).toBe(400)
    expect(sendTransferWith).not.toHaveBeenCalled()
  })

  test("tells the merchant why the service refused, rather than a bare failure", async () => {
    // The branch refusal — "you can only move stock in and out of your own
    // branch" — is the one message a manager most needs to see. A generic 500
    // would leave them retrying a thing that will never work.
    sendTransferWith.mockImplementationOnce(() => {
      throw new Error('You can only move stock in and out of your own branch')
    })
    appUser = OWNER
    authedUser = { id: 'u1' }
    inventoryEnabled = true

    const response = await POST(transferRequest({ action: 'send', transferId: 'tr1' }))

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe(
      'You can only move stock in and out of your own branch',
    )
  })
})

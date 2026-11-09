/** @jest-environment node */
import { NextRequest } from 'next/server'

/**
 * The merchant app's two delivery routes run on the service role, so the
 * route's own checks ARE the boundary: a bearer member of THIS store, the
 * `orders` key, and the caller's branch.
 */

const requireBearerStoreCaller = jest.fn()
jest.mock('@/lib/auth/bearer-caller', () => ({ requireBearerStoreCaller: (...args: unknown[]) => requireBearerStoreCaller(...args) }))
const save = jest.fn()
const createLink = jest.fn()
jest.mock('@/lib/delivery/order-delivery-edit-server', () => ({
  saveOrderDeliveryEdit: (...args: unknown[]) => save(...args),
  createOrderPinLink: (...args: unknown[]) => createLink(...args),
}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ marker: 'admin' }) }))

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORDER = '22222222-2222-4222-8222-222222222222'
const BRANCH = '33333333-3333-4333-8333-333333333333'
const OTHER_BRANCH = '44444444-4444-4444-8444-444444444444'

const OWNER = { role: 'admin', is_owner: true, outlet_id: null, permissions: null }
const BRANCH_STAFF = { role: 'admin', is_owner: false, outlet_id: BRANCH, permissions: ['orders'] }
const NO_ORDERS = { role: 'admin', is_owner: false, outlet_id: null, permissions: ['menu'] }

function post(path: string, body: unknown) {
  return new NextRequest(`https://www.example.test${path}`, { method: 'POST', body: JSON.stringify(body), headers: { authorization: 'Bearer t' } })
}

async function saveDetails(body: unknown) {
  const { POST } = await import('@/app/api/orders/delivery-details/route')
  return POST(post('/api/orders/delivery-details', body))
}

async function pinLink(body: unknown) {
  const { POST } = await import('@/app/api/orders/pin-link/route')
  return POST(post('/api/orders/pin-link', body))
}

function asCaller(appUser: unknown) {
  requireBearerStoreCaller.mockResolvedValue({ ok: true, user: { id: 'u1' }, appUser })
}

beforeEach(() => {
  requireBearerStoreCaller.mockReset()
  save.mockReset().mockResolvedValue({ ok: true, customerData: { delivery_landmark: 'Blue gate' } })
  createLink.mockReset().mockResolvedValue({ ok: true, url: 'https://www.example.test/s/pin/x?t=1.ab' })
})

describe.each([
  ['POST /api/orders/delivery-details', saveDetails, { tenantId: TENANT, orderId: ORDER, patch: { landmark: 'Blue gate' } }, save],
  ['POST /api/orders/pin-link', pinLink, { tenantId: TENANT, orderId: ORDER }, createLink],
] as const)('%s', (_name, call, body, writer) => {
  it('refuses a bad body before asking who the caller is', async () => {
    const response = await call({ ...body, orderId: 'not-a-uuid' })
    expect(response.status).toBe(400)
    expect(requireBearerStoreCaller).not.toHaveBeenCalled()
  })

  it('checks the bearer belongs to the store named in the body, for editing', async () => {
    requireBearerStoreCaller.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) })
    const response = await call(body)
    expect(response.status).toBe(403)
    expect(requireBearerStoreCaller).toHaveBeenCalledWith(expect.anything(), TENANT, 'edit')
    expect(writer).not.toHaveBeenCalled()
  })

  it('refuses a staff account without the orders key', async () => {
    asCaller(NO_ORDERS)
    const response = await call(body)
    expect(response.status).toBe(403)
    expect(writer).not.toHaveBeenCalled()
  })

  it('refuses a caller with no account at this store', async () => {
    asCaller(null)
    expect((await call(body)).status).toBe(403)
    expect(writer).not.toHaveBeenCalled()
  })

  it("limits a branch account to its own branch's orders", async () => {
    asCaller(BRANCH_STAFF)
    expect((await call(body)).status).toBe(200)
    const input = (writer.mock.calls[0] as unknown[])[1] as { isOutletInScope: (outletId: string | null) => boolean }
    expect(input.isOutletInScope(BRANCH)).toBe(true)
    expect(input.isOutletInScope(OTHER_BRANCH)).toBe(false)
    expect(input.isOutletInScope(null)).toBe(false)
  })

  it('lets the owner reach every order', async () => {
    asCaller(OWNER)
    expect((await call(body)).status).toBe(200)
    const input = (writer.mock.calls[0] as unknown[])[1] as { isOutletInScope: (outletId: string | null) => boolean }
    expect(input.isOutletInScope(OTHER_BRANCH)).toBe(true)
    expect(input.isOutletInScope(null)).toBe(true)
  })

  it("passes the writer's refusal through with its status", async () => {
    asCaller(OWNER)
    writer.mockResolvedValue({ ok: false, status: 409, error: 'A rider is already booked.' })
    const response = await call(body)
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'A rider is already booked.' })
  })
})

describe('POST /api/orders/delivery-details', () => {
  it('writes as the merchant with the service role', async () => {
    asCaller(OWNER)
    await saveDetails({ tenantId: TENANT, orderId: ORDER, patch: { landmark: 'Blue gate' } })
    expect(save).toHaveBeenCalledWith({ marker: 'admin' }, expect.objectContaining({ tenantId: TENANT, orderId: ORDER, editor: 'merchant', patch: { landmark: 'Blue gate' } }))
  })

  it('refuses keys a merchant may not send', async () => {
    asCaller(OWNER)
    const response = await saveDetails({ tenantId: TENANT, orderId: ORDER, patch: { deliveryFee: 0 } })
    expect(response.status).toBe(400)
    expect(save).not.toHaveBeenCalled()
  })
})

describe('POST /api/orders/pin-link', () => {
  it("builds the link on this server's own origin", async () => {
    asCaller(OWNER)
    const response = await pinLink({ tenantId: TENANT, orderId: ORDER })
    await expect(response.json()).resolves.toEqual({ url: 'https://www.example.test/s/pin/x?t=1.ab' })
    expect(createLink).toHaveBeenCalledWith({ marker: 'admin' }, expect.objectContaining({ tenantId: TENANT, orderId: ORDER, origin: 'https://www.example.test' }))
  })
})

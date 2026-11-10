/** @jest-environment node */
import { NextRequest } from 'next/server'

const save = jest.fn()
jest.mock('@/lib/delivery/order-delivery-edit-server', () => ({ saveOrderDeliveryEdit: (...args: unknown[]) => save(...args) }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ marker: 'admin' }) }))
const limit = jest.fn()
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: (...args: unknown[]) => limit(...args) }))

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORDER = '22222222-2222-4222-8222-222222222222'

function post(body: unknown) {
  return new NextRequest('https://x.test/api/orders/pin', { method: 'POST', body: JSON.stringify(body), headers: { 'x-real-ip': '1.2.3.4' } })
}

async function call(body: unknown) {
  const { POST } = await import('@/app/api/orders/pin/route')
  return POST(post(body))
}

async function validToken(orderId = ORDER): Promise<string> {
  const { createPinLinkToken } = await import('@/lib/delivery/pin-link-token')
  return createPinLinkToken(orderId)
}

const OLD_SECRET = process.env.API_SECRET
beforeAll(() => {
  process.env.API_SECRET = 'test-secret'
})
afterAll(() => {
  process.env.API_SECRET = OLD_SECRET
})
beforeEach(() => {
  save.mockReset().mockResolvedValue({ ok: true, customerData: { secret: 'never sent back' } })
  limit.mockReset().mockResolvedValue({ allowed: true, retryAfterSec: 1 })
})

const PIN = { lat: 14.5, lng: 121 }

describe('POST /api/orders/pin', () => {
  it('saves the pin as the customer and sends nothing of the order back', async () => {
    const response = await call({ tenantId: TENANT, orderId: ORDER, token: await validToken(), patch: { pin: PIN, landmark: 'Blue gate' } })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(save).toHaveBeenCalledWith({ marker: 'admin' }, { tenantId: TENANT, orderId: ORDER, patch: { pin: PIN, landmark: 'Blue gate' }, editor: 'customer' })
  })

  it("refuses a token for another order, and the receipt's tracking token", async () => {
    const crypto = await import('crypto')
    const tracking = crypto.createHmac('sha256', 'test-secret').update(ORDER).digest('hex')
    for (const token of [await validToken('33333333-3333-4333-8333-333333333333'), tracking, 'x']) {
      const response = await call({ tenantId: TENANT, orderId: ORDER, token, patch: { pin: PIN } })
      expect(response.status).toBe(401)
    }
    expect(save).not.toHaveBeenCalled()
  })

  it("won't count a bad token against the order's limit", async () => {
    await call({ tenantId: TENANT, orderId: ORDER, token: 'x', patch: { pin: PIN } })
    expect(limit.mock.calls.map(([key]) => key)).toEqual(['order-pin-ip:1.2.3.4'])
  })

  it.each([
    ['no pin', { landmark: 'x' }],
    ['the store note', { pin: PIN, storeNote: 'x' }],
    ['the fee', { pin: PIN, delivery_fee: 0 }],
    ['a broken pin', { pin: { lat: 200, lng: 1 } }],
  ])('refuses %s', async (_name, patch) => {
    const response = await call({ tenantId: TENANT, orderId: ORDER, token: await validToken(), patch })
    expect(response.status).toBe(400)
    expect(save).not.toHaveBeenCalled()
  })

  it('limits per address and per order', async () => {
    limit.mockResolvedValueOnce({ allowed: false, retryAfterSec: 1 })
    expect((await call({ tenantId: TENANT, orderId: ORDER, token: await validToken(), patch: { pin: PIN } })).status).toBe(429)

    limit.mockResolvedValueOnce({ allowed: true, retryAfterSec: 1 }).mockResolvedValueOnce({ allowed: false, retryAfterSec: 1 })
    expect((await call({ tenantId: TENANT, orderId: ORDER, token: await validToken(), patch: { pin: PIN } })).status).toBe(429)
    expect(save).not.toHaveBeenCalled()
  })

  it('passes on a refusal from the rules', async () => {
    save.mockResolvedValue({ ok: false, status: 409, error: 'A rider is already booked.' })
    const response = await call({ tenantId: TENANT, orderId: ORDER, token: await validToken(), patch: { pin: PIN } })
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'A rider is already booked.' })
  })
})

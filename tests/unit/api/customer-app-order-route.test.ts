/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/orders/customer-app/route'

const createOrderAction = jest.fn()
jest.mock('@/app/actions/orders', () => ({
  createOrderAction: (...a: unknown[]) => createOrderAction(...a),
}))

const checkRateLimit = jest.fn()
jest.mock('@/lib/distributed-rate-limit', () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
}))

const TENANT = '0dd96b60-5232-4c79-922b-0bd9022d12ba'
const ATTEMPT = '66ea076d-2aa1-45d4-b575-743fcdf3d73a'

const body = () => ({
  tenantId: TENANT,
  clientOrderId: ATTEMPT,
  items: [{ menu_item_id: 'i1', menu_item_name: 'Burger', addons: [], quantity: 1, price: 100, subtotal: 100 }],
})

const post = (payload: unknown, headers: Record<string, string> = { 'x-real-ip': '203.0.113.9' }) =>
  POST(
    new NextRequest('http://localhost/api/orders/customer-app', {
      method: 'POST',
      headers,
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    }),
  )

beforeEach(() => {
  jest.clearAllMocks()
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 10, retryAfterSec: 1 })
  createOrderAction.mockResolvedValue({ success: true, data: { id: 'order-1', daily_number: 3 } })
})

describe('POST /api/orders/customer-app', () => {
  it('places the order through createOrderAction and returns only the id', async () => {
    const res = await post(body())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, orderId: 'order-1', dailyNumber: 3 })
    expect(createOrderAction).toHaveBeenCalledTimes(1)
    expect(createOrderAction.mock.calls[0][0]).toBe(TENANT)
    expect(createOrderAction.mock.calls[0][16]).toBe(ATTEMPT)
  })

  it('rate limits per client address and per store', async () => {
    await post(body())

    const keys = checkRateLimit.mock.calls.map((call) => call[0])
    expect(keys).toContain('customer-app-order-ip:203.0.113.9')
    expect(keys).toContain(`customer-app-order-tenant:${TENANT}`)
  })

  it('answers 429 and writes nothing when the address is over its limit', async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 30 })

    const res = await post(body())

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
    expect((await res.json()).refused).toBe(true)
    expect(createOrderAction).not.toHaveBeenCalled()
  })

  it('answers 429 and writes nothing when the store is over its limit', async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: true, remaining: 1, retryAfterSec: 1 })
    checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 12 })

    const res = await post(body())

    expect(res.status).toBe(429)
    expect(createOrderAction).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON without touching the action', async () => {
    const res = await post('{not json')

    expect(res.status).toBe(400)
    expect(createOrderAction).not.toHaveBeenCalled()
  })

  it('rejects an invalid envelope without touching the action', async () => {
    const res = await post({ ...body(), tenantId: 'nope' })

    expect(res.status).toBe(400)
    expect(createOrderAction).not.toHaveBeenCalled()
  })

  it('rejects an oversized body', async () => {
    const res = await post(JSON.stringify({ ...body(), pad: 'x'.repeat(250_000) }))

    expect(res.status).toBe(413)
    expect(createOrderAction).not.toHaveBeenCalled()
  })

  it('returns the refusal sentence when a dish cannot be made', async () => {
    createOrderAction.mockResolvedValue({
      success: false,
      refused: true,
      error: 'Sorry, we can only make 1 Burger right now.',
    })

    const res = await post(body())

    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      success: false,
      refused: true,
      error: 'Sorry, we can only make 1 Burger right now.',
    })
  })

  it('does not leak a thrown database error', async () => {
    createOrderAction.mockResolvedValue({ success: false, error: 'new row violates row-level security policy' })

    const res = await post(body())

    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('row-level')
  })

  it('cannot forge status, payment or total: those keys never reach the action', async () => {
    await post({ ...body(), status: 'delivered', payment_status: 'paid', total: 0 })

    expect(JSON.stringify(createOrderAction.mock.calls[0])).not.toMatch(/delivered|"paid"/)
  })
})

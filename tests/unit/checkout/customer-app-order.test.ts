import {
  parseCustomerAppOrder,
  toCreateOrderActionArgs,
  toCustomerAppResponse,
} from '@/lib/checkout/customer-app-order'
import { classifyCustomerAppOrderResponse } from '../../../mobile/lib/checkout-outcome'

const TENANT = '0dd96b60-5232-4c79-922b-0bd9022d12ba'
const ATTEMPT = '66ea076d-2aa1-45d4-b575-743fcdf3d73a'
const ORDER_TYPE = '9b3f1c1e-3b0a-4c63-8d1b-0c8f7a5b2e11'

const line = {
  menu_item_id: 'item-1',
  menu_item_name: 'Burger',
  addons: ['Cheese'],
  quantity: 2,
  price: 150,
  subtotal: 300,
}

const validBody = () => ({
  tenantId: TENANT,
  clientOrderId: ATTEMPT,
  orderTypeId: ORDER_TYPE,
  customerInfo: { name: 'Ana', contact: '0917' },
  customerData: { customer_name: 'Ana' },
  items: [line],
})

describe('parseCustomerAppOrder', () => {
  it('accepts a well-formed order', () => {
    const parsed = parseCustomerAppOrder(validBody())

    expect(parsed.ok).toBe(true)
  })

  it.each([
    ['a missing tenant', { ...validBody(), tenantId: undefined }],
    ['a non-uuid tenant', { ...validBody(), tenantId: 'acme' }],
    ['a missing attempt id', { ...validBody(), clientOrderId: undefined }],
    ['no items', { ...validBody(), items: [] }],
    ['a non-object body', 'hello'],
    ['a null body', null],
  ])('refuses %s', (_label, body) => {
    const parsed = parseCustomerAppOrder(body)

    expect(parsed.ok).toBe(false)
  })

  it('refuses customer data with an absurd number of keys', () => {
    const customerData = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`k${i}`, 'x']))

    const parsed = parseCustomerAppOrder({ ...validBody(), customerData })

    expect(parsed.ok).toBe(false)
  })

  it('carries no money the server could believe: unknown keys are dropped', () => {
    const parsed = parseCustomerAppOrder({
      ...validBody(),
      total: 1,
      status: 'paid',
      paymentStatus: 'paid',
      deliveryFee: 0,
    })

    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.request).not.toHaveProperty('total')
      expect(parsed.request).not.toHaveProperty('status')
      expect(parsed.request).not.toHaveProperty('paymentStatus')
      expect(parsed.request).not.toHaveProperty('deliveryFee')
    }
  })
})

describe('toCreateOrderActionArgs', () => {
  it('maps onto the action positional arguments with the attempt id as clientOrderId', () => {
    const parsed = parseCustomerAppOrder({ ...validBody(), paymentMethodId: ORDER_TYPE, scheduledForISO: '2026-12-01T10:00:00.000Z' })
    if (!parsed.ok) throw new Error('expected a valid order')

    const args = toCreateOrderActionArgs(parsed.request)

    expect(args[0]).toBe(TENANT)
    expect(args[1]).toEqual([line])
    expect(args[3]).toBe(ORDER_TYPE)
    expect(args[5]).toBeUndefined() // delivery fee is never sent
    expect(args[6]).toBeUndefined() // no Lalamove quote
    expect(args[7]).toBe(ORDER_TYPE) // payment method id
    expect(args[12]).toBe('2026-12-01T10:00:00.000Z')
    expect(args[16]).toBe(ATTEMPT)
    expect(args).toHaveLength(17)
  })
})

describe('toCustomerAppResponse', () => {
  it('answers a saved order with its id and daily number', () => {
    const response = toCustomerAppResponse({ success: true, data: { id: 'o-1', daily_number: 7 } })

    expect(response).toEqual({ status: 200, body: { success: true, orderId: 'o-1', dailyNumber: 7 } })
  })

  it('never calls a success without an id a saved order', () => {
    const response = toCustomerAppResponse({ success: true, data: {} })

    expect(response.status).toBe(500)
    expect(response.body.success).toBe(false)
  })

  it('carries a refusal sentence (e.g. a dish that cannot be made) untouched', () => {
    const response = toCustomerAppResponse({
      success: false,
      refused: true,
      error: 'Sorry, only 2 Burger can be made right now.',
    })

    expect(response.status).toBe(422)
    expect(response.body).toEqual({
      success: false,
      refused: true,
      error: 'Sorry, only 2 Burger can be made right now.',
    })
  })

  it('hides the diagnostic of a lost order behind a generic sentence', () => {
    const response = toCustomerAppResponse({ success: false, error: 'duplicate key value violates ...' })

    expect(response.status).toBe(500)
    expect(response.body).toMatchObject({ success: false, refused: false })
    expect(JSON.stringify(response.body)).not.toContain('duplicate key')
  })
})

describe('classifyCustomerAppOrderResponse (the app side)', () => {
  it('reads a saved order', () => {
    const outcome = classifyCustomerAppOrderResponse(true, 200, { success: true, orderId: ' o-1 ' })

    expect(outcome).toMatchObject({ status: 'saved', orderId: 'o-1' })
  })

  it('keeps the refusal sentence for the diner and closes Messenger', () => {
    const outcome = classifyCustomerAppOrderResponse(false, 422, {
      success: false,
      refused: true,
      error: 'Sorry, Burger just went out of stock.',
    })

    expect(outcome.status).toBe('refused')
    expect(outcome.message).toBe('Sorry, Burger just went out of stock.')
  })

  it('treats a rate-limit answer as a refusal the diner can act on', () => {
    const outcome = classifyCustomerAppOrderResponse(false, 429, {
      success: false,
      refused: true,
      error: 'Please wait a minute.',
    })

    expect(outcome.status).toBe('refused')
  })

  it.each([
    ['a server error', false, 500, { success: false, refused: false, error: 'x' }, undefined],
    ['an unreadable body', false, 502, null, undefined],
    ['a success with no id', true, 200, { success: true }, undefined],
    ['a network failure', false, 0, null, new Error('Network request failed')],
  ])('keeps Messenger open on %s', (_label, ok, status, body, networkError) => {
    const outcome = classifyCustomerAppOrderResponse(ok, status, body, networkError)

    expect(outcome.status).toBe('failed')
    expect(outcome.orderId).toBeNull()
  })

  it('does not call a refusal without a sentence a refusal', () => {
    const outcome = classifyCustomerAppOrderResponse(false, 422, { success: false, refused: true })

    expect(outcome.status).toBe('failed')
  })
})

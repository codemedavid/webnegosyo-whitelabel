import {
  buildAppCustomerData,
  buildPlaceOrderInput,
  chooseOrderType,
  DELIVERY_NEEDED,
  PAYMENT_GONE,
  PAYMENT_NEEDED,
  PROOF_NEEDED,
  QUOTE_NEEDED,
  REWARDS_SOON,
  type OrderRequestInput,
} from '@/lib/app-api/orders/order-request'
import { encodeAppQuoteToken } from '@/lib/app-api/delivery/quote-token'
import type { PaymentMethodWithLinks } from '@/lib/checkout/checkout-config'
import type { OrderType } from '@/types/database'
import { CASH, DELIVERY_TYPE, DISH, GCASH, KEY, PICKUP_TYPE, TENANT, draft } from './order-fixtures'

const ORDER_TYPES = [
  { id: PICKUP_TYPE, type: 'pickup', name: 'Pick Up', is_enabled: true, available_on_web: true },
  { id: DELIVERY_TYPE, type: 'delivery', name: 'Delivery', is_enabled: true, available_on_web: true },
  { id: 'pos-only', type: 'grab', name: 'Grab', is_enabled: true, available_on_web: false },
  { id: 'odd', type: 'drive_thru', name: 'Drive', is_enabled: true, available_on_web: true },
] as unknown as OrderType[]

const METHODS = [
  { id: CASH, name: 'Cash', is_active: true, details: '', qr_code_url: '', require_payment_proof: false, payment_method_order_types: [{ order_type_id: PICKUP_TYPE }, { order_type_id: DELIVERY_TYPE }] },
  { id: GCASH, name: 'GCash', is_active: true, details: '0917 000 0000', qr_code_url: 'https://qr', require_payment_proof: true, payment_method_order_types: [{ order_type_id: PICKUP_TYPE }, { order_type_id: DELIVERY_TYPE }] },
  { id: 'delivery-only', name: 'COD', is_active: true, require_payment_proof: false, payment_method_order_types: [{ order_type_id: DELIVERY_TYPE }] },
] as unknown as PaymentMethodWithLinks[]

const PROFILE = { name: 'Ana', phoneE164: '+639171234567' }
const LINES = [{ menu_item_id: DISH, menu_item_name: 'Iced Latte', addons: [], quantity: 2, price: 0, subtotal: 0, option_ids: [], addon_ids: [] }]
const PLACE = { address: '12 Mabini St, QC', lat: 14.62, lng: 121.01, quoteToken: null }

function request(overrides: Partial<OrderRequestInput> = {}, typeId = PICKUP_TYPE): OrderRequestInput {
  const orderType = chooseOrderType(ORDER_TYPES, typeId)
  if (!orderType) throw new Error('fixture order type')
  return { tenantId: TENANT, draft: draft(), idempotencyKey: KEY, orderType, paymentMethods: METHODS, profile: PROFILE, isLalamoveStore: false, lines: LINES, outletId: null, ...overrides }
}

describe('chooseOrderType', () => {
  it('finds the enabled, web-orderable type of a known kind', () => {
    expect(chooseOrderType(ORDER_TYPES, PICKUP_TYPE)).toMatchObject({ id: PICKUP_TYPE, kind: 'pickup', name: 'Pick Up' })
  })

  it.each([['pos-only'], ['odd'], ['missing']])('refuses %s', (id) => {
    expect(chooseOrderType(ORDER_TYPES, id)).toBeNull()
  })
})

describe('buildPlaceOrderInput', () => {
  it('builds the engine input: session contact, app channel, idempotency key as clientOrderId', () => {
    const built = buildPlaceOrderInput(request({ draft: draft({ voucherCode: 'SAVE10', notes: '  no ice  ', outletId: 'branch-1' }), outletId: 'branch-1' }))
    expect(built).toEqual({
      ok: true,
      paymentMethodName: 'Cash',
      input: {
        tenantId: TENANT,
        items: LINES,
        customerInfo: { name: 'Ana', contact: '+639171234567' },
        orderTypeId: PICKUP_TYPE,
        customerData: { customer_name: 'Ana', customer_phone: '+639171234567', notes: 'no ice' },
        paymentMethodId: CASH,
        outletId: 'branch-1',
        voucherCodes: ['SAVE10'],
        clientOrderId: KEY,
        channel: 'app',
      },
    })
  })

  it('refuses a reward until Phase 5', () => {
    expect(buildPlaceOrderInput(request({ draft: draft({ rewardId: 'reward-1' }) }))).toEqual({ ok: false, message: REWARDS_SOON })
  })

  it('refuses a method that is not linked to the order type', () => {
    expect(buildPlaceOrderInput(request({ draft: draft({ paymentMethodId: 'delivery-only' }) }))).toEqual({ ok: false, message: PAYMENT_GONE })
    expect(buildPlaceOrderInput(request({ draft: draft({ paymentMethodId: 'unknown' }) }))).toEqual({ ok: false, message: PAYMENT_GONE })
  })

  // The web checkout places the order without a method when the order type offers none
  // (resolvePaymentSubmitPlan 'submit-order'); 119 of 301 live stores have no payment method.
  it('places without a method when the order type offers none, as the web checkout does', () => {
    const built = buildPlaceOrderInput(request({ paymentMethods: [], draft: draft({ paymentMethodId: null, paymentReference: 'IGNORED' }) }))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.paymentMethodName).toBeNull()
    expect(built.input).not.toHaveProperty('paymentMethodId')
    expect(built.input).not.toHaveProperty('paymentMethodName')
    expect(built.input).not.toHaveProperty('paymentProof')
    expect(built.input).toMatchObject({ orderTypeId: PICKUP_TYPE, clientOrderId: KEY, channel: 'app' })
  })

  it('counts only active methods linked to this order type as offered', () => {
    const elsewhere = [
      { id: 'inactive', name: 'Old', is_active: false, payment_method_order_types: [{ order_type_id: PICKUP_TYPE }] },
      { id: 'unlinked', name: 'Bank', is_active: true, payment_method_order_types: [] },
      { id: 'delivery-only', name: 'COD', is_active: true, payment_method_order_types: [{ order_type_id: DELIVERY_TYPE }] },
    ] as unknown as PaymentMethodWithLinks[]
    expect(buildPlaceOrderInput(request({ paymentMethods: elsewhere, draft: draft({ paymentMethodId: null }) })).ok).toBe(true)
  })

  it('asks for a method when the order type offers one and none was sent', () => {
    expect(buildPlaceOrderInput(request({ draft: draft({ paymentMethodId: null }) }))).toEqual({ ok: false, message: PAYMENT_NEEDED })
  })

  it('asks for the reference when the method requires proof', () => {
    expect(buildPlaceOrderInput(request({ draft: draft({ paymentMethodId: GCASH }) }))).toEqual({ ok: false, message: PROOF_NEEDED })
  })

  it('passes only the method id (the engine records the stored method), with the typed reference as proof', () => {
    const built = buildPlaceOrderInput(request({ draft: draft({ paymentMethodId: GCASH, paymentReference: 'REF123' }) }))
    expect(built.ok && built.input).toMatchObject({ paymentMethodId: GCASH, paymentProof: { reference: 'REF123' } })
    expect(built.ok && built.input).not.toHaveProperty('paymentMethodName')
    expect(built.ok && built.input).not.toHaveProperty('paymentMethodDetails')
  })

  it('takes a payment screenshot as the proof, as the web checkout does', () => {
    const image = { url: 'https://ik.imagekit.io/demo/payment-proofs/proof.jpg', fileId: 'file-1' }
    const built = buildPlaceOrderInput(request({ draft: draft({ paymentMethodId: GCASH, paymentProofImage: image }) }))
    expect(built.ok && built.input.paymentProof).toEqual({ url: image.url, publicId: 'file-1' })
  })

  it('keeps both a screenshot and a reference when both are sent', () => {
    const image = { url: 'https://ik.imagekit.io/demo/payment-proofs/proof.jpg', fileId: 'file-1' }
    const built = buildPlaceOrderInput(request({ draft: draft({ paymentMethodId: GCASH, paymentReference: 'REF9', paymentProofImage: image }) }))
    expect(built.ok && built.input.paymentProof).toEqual({ url: image.url, publicId: 'file-1', reference: 'REF9' })
  })

  it('treats a screenshot from anywhere but ImageKit as missing', () => {
    const forged = { url: 'https://evil.example/proof.jpg', fileId: 'x' }
    expect(buildPlaceOrderInput(request({ draft: draft({ paymentMethodId: GCASH, paymentProofImage: forged }) }))).toEqual({ ok: false, message: PROOF_NEEDED })
    const withReference = buildPlaceOrderInput(request({ draft: draft({ paymentMethodId: GCASH, paymentReference: 'REF9', paymentProofImage: forged }) }))
    expect(withReference.ok && withReference.input.paymentProof).toEqual({ reference: 'REF9' })
  })

  it('sends no proof for a method that never asked for one', () => {
    const image = { url: 'https://ik.imagekit.io/demo/payment-proofs/proof.jpg', fileId: 'file-1' }
    const built = buildPlaceOrderInput(request({ draft: draft({ paymentMethodId: CASH, paymentReference: 'REF9', paymentProofImage: image }) }))
    expect(built.ok).toBe(true)
    expect(built.ok && built.input).not.toHaveProperty('paymentProof')
  })

  it('requires a picked place for delivery and writes the web address keys', () => {
    expect(buildPlaceOrderInput(request({}, DELIVERY_TYPE))).toEqual({ ok: false, message: DELIVERY_NEEDED })
    const built = buildPlaceOrderInput(request({ draft: draft({ orderTypeId: DELIVERY_TYPE, delivery: PLACE }) }, DELIVERY_TYPE))
    expect(built.ok && built.input.customerData).toEqual({
      customer_name: 'Ana',
      customer_phone: '+639171234567',
      delivery_address: '12 Mabini St, QC',
      delivery_lat: '14.62',
      delivery_lng: '121.01',
    })
    expect(built.ok && built.input.lalamoveQuotationId).toBeUndefined()
  })

  it('ignores a delivery place on a pickup order', () => {
    const built = buildPlaceOrderInput(request({ draft: draft({ delivery: PLACE }) }))
    expect(built.ok && built.input.customerData).not.toHaveProperty('delivery_address')
  })

  it('hands a Lalamove store the quotation and signature from the quote token', () => {
    const quoteToken = encodeAppQuoteToken({ quotationId: 'q-1', signature: 'sig.abc' })
    const built = buildPlaceOrderInput(
      request({ isLalamoveStore: true, draft: draft({ orderTypeId: DELIVERY_TYPE, delivery: { ...PLACE, quoteToken } }) }, DELIVERY_TYPE),
    )
    expect(built.ok && built.input).toMatchObject({ lalamoveQuotationId: 'q-1', lalamoveQuoteSignature: 'sig.abc' })
  })

  it('refuses a Lalamove delivery without a readable quote token', () => {
    const built = buildPlaceOrderInput(request({ isLalamoveStore: true, draft: draft({ orderTypeId: DELIVERY_TYPE, delivery: { ...PLACE, quoteToken: 'forged' } }) }, DELIVERY_TYPE))
    expect(built).toEqual({ ok: false, message: QUOTE_NEEDED })
  })
})

describe('buildAppCustomerData', () => {
  it('omits a missing name and blank notes (never invents keys)', () => {
    expect(buildAppCustomerData({ name: null, phoneE164: '+639171234567' }, null, '   ')).toEqual({ customer_phone: '+639171234567' })
  })
})

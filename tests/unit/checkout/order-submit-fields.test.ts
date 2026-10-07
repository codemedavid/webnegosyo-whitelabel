import {
  buildOrderCustomerInfo,
  buildPaymentProofPayload,
  mintClientOrderId,
  paymentProofCustomerFields,
  resolveQuoteForOrder,
  scheduleCustomerFields,
} from '@/lib/checkout/order-submit-fields'

describe('resolveQuoteForOrder', () => {
  const QUOTED = {
    deliveryFee: 80,
    quotationId: 'q-1',
    quoteSignature: 'sig-1',
    quotedAddress: 'Manila',
    currentAddress: 'Manila',
  }

  it('bills the fee, quotation and signature quoted for the current address', () => {
    expect(resolveQuoteForOrder(QUOTED)).toEqual({ deliveryFee: 80, quotationId: 'q-1', quoteSignature: 'sig-1' })
  })

  it('treats a ₱0 quote as a fee, the same way the summary does', () => {
    expect(resolveQuoteForOrder({ ...QUOTED, deliveryFee: 0 }).deliveryFee).toBe(0)
  })

  it('drops everything quoted for a different address', () => {
    expect(resolveQuoteForOrder({ ...QUOTED, currentAddress: 'Cebu' })).toEqual({
      deliveryFee: undefined,
      quotationId: undefined,
      quoteSignature: undefined,
    })
  })

  it('sends no signature without a quotation to sign', () => {
    expect(resolveQuoteForOrder({ ...QUOTED, quotationId: null })).toEqual({
      deliveryFee: 80,
      quotationId: undefined,
      quoteSignature: undefined,
    })
  })

  it('sends no fee when nothing was quoted', () => {
    expect(resolveQuoteForOrder({ ...QUOTED, deliveryFee: null }).deliveryFee).toBeUndefined()
  })
})

describe('payment proof', () => {
  it('is absent when the customer gave neither a screenshot nor a reference', () => {
    expect(buildPaymentProofPayload({ url: '', publicId: '', reference: '' })).toBeUndefined()
    expect(paymentProofCustomerFields({ url: '', publicId: '', reference: '' })).toEqual({})
  })

  it('carries a reference alone, with the missing parts as null', () => {
    expect(buildPaymentProofPayload({ url: '', publicId: '', reference: 'REF' })).toEqual({
      url: null,
      publicId: null,
      reference: 'REF',
    })
  })

  it('writes a screenshot into the QR customer data, leaving missing parts undefined', () => {
    expect(paymentProofCustomerFields({ url: 'https://ik/x.png', publicId: 'file-1', reference: '' })).toEqual({
      payment_proof_url: 'https://ik/x.png',
      payment_proof_public_id: 'file-1',
      payment_proof_reference: undefined,
    })
  })
})

describe('scheduleCustomerFields', () => {
  it('is empty for an ASAP order', () => {
    expect(scheduleCustomerFields(null, null)).toEqual({})
  })

  it('records the instant and the label the customer saw', () => {
    expect(scheduleCustomerFields('2026-10-10T02:00:00.000Z', 'Sat 10:00 AM')).toEqual({
      scheduled_for: '2026-10-10T02:00:00.000Z',
      scheduled_for_label: 'Sat 10:00 AM',
    })
  })

  it('keeps an empty label rather than dropping the key', () => {
    expect(scheduleCustomerFields('2026-10-10T02:00:00.000Z', null)).toEqual({
      scheduled_for: '2026-10-10T02:00:00.000Z',
      scheduled_for_label: '',
    })
  })
})

describe('buildOrderCustomerInfo', () => {
  it('names the customer and resolves their contact from any phone/email field', () => {
    expect(buildOrderCustomerInfo({ customer_name: 'Juan', contact_email: 'juan@example.com' })).toEqual({
      name: 'Juan',
      contact: 'juan@example.com',
    })
  })

  it('leaves blank parts undefined', () => {
    expect(buildOrderCustomerInfo({})).toEqual({ name: undefined, contact: undefined })
  })
})

describe('mintClientOrderId', () => {
  it('uses crypto.randomUUID when available', () => {
    expect(mintClientOrderId({ randomUUID: () => 'uuid-1' })).toBe('uuid-1')
  })

  it('falls back to a timestamped random id without crypto', () => {
    expect(mintClientOrderId(undefined)).toMatch(/^\d+-[a-z0-9]+$/)
  })
})

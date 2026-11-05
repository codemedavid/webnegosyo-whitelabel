import { canSplitPayments, paymentGroupOf, splitPaymentMethods } from '@/lib/checkout/payment-groups'

interface TestMethod {
  id?: string
  details?: string
  qr_code_url?: string
  require_payment_proof?: boolean
  skip_payment_details?: boolean
}

const method = (over: TestMethod): TestMethod => ({ require_payment_proof: false, skip_payment_details: false, ...over })

describe('payment groups (pay now / in person)', () => {
  it('puts a method that asks for proof, a QR or account details under Pay now', () => {
    expect(paymentGroupOf(method({ require_payment_proof: true, skip_payment_details: true }))).toBe('now')
    expect(paymentGroupOf(method({ qr_code_url: 'https://example.com/qr.png' }))).toBe('now')
    expect(paymentGroupOf(method({ details: 'Number: 0917 123 4567' }))).toBe('now')
  })

  it('puts a method with its payment step off, or nothing to hand over, under in person', () => {
    expect(paymentGroupOf(method({ skip_payment_details: true, details: 'Exact change please' }))).toBe('in_person')
    expect(paymentGroupOf(method({ details: '   ' }))).toBe('in_person')
    expect(paymentGroupOf(method({}))).toBe('in_person')
  })

  it('keeps the store’s order inside each group and splits only when both have a method', () => {
    const gcash = method({ id: 'g', details: 'x' })
    const cash = method({ id: 'c' })
    const maya = method({ id: 'm', qr_code_url: 'https://example.com/m.png' })
    const groups = splitPaymentMethods([gcash, cash, maya])
    expect(groups.now.map((m) => m.id)).toEqual(['g', 'm'])
    expect(groups.in_person.map((m) => m.id)).toEqual(['c'])
    expect(canSplitPayments(groups)).toBe(true)
    expect(canSplitPayments(splitPaymentMethods([gcash, maya]))).toBe(false)
  })
})

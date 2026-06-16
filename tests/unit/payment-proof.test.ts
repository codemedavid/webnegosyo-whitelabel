import {
  isPaymentProofRequired,
  isPaymentProofSatisfied,
  getPaymentProofError,
  PAYMENT_PROOF_FOLDER,
} from '@/lib/payment-proof'
import type { PaymentMethod } from '@/types/database'

function method(overrides: Partial<PaymentMethod> = {}): PaymentMethod {
  return {
    id: 'pm-1',
    tenant_id: 't-1',
    name: 'GCash',
    is_active: true,
    order_index: 0,
    created_at: '2026-06-17T00:00:00.000Z',
    updated_at: '2026-06-17T00:00:00.000Z',
    ...overrides,
  }
}

describe('isPaymentProofRequired', () => {
  test('returns false when no method is selected', () => {
    expect(isPaymentProofRequired(null)).toBe(false)
    expect(isPaymentProofRequired(undefined)).toBe(false)
  })

  test('returns false for a method that does not require proof', () => {
    expect(isPaymentProofRequired(method({ require_payment_proof: false }))).toBe(false)
    expect(isPaymentProofRequired(method({}))).toBe(false)
  })

  test('returns true for a method that requires proof', () => {
    expect(isPaymentProofRequired(method({ require_payment_proof: true }))).toBe(true)
  })
})

describe('isPaymentProofSatisfied', () => {
  test('is satisfied when proof is not required, regardless of inputs', () => {
    const m = method({ require_payment_proof: false })
    expect(isPaymentProofSatisfied(m, { screenshotUrl: '', reference: '' })).toBe(true)
  })

  test('is NOT satisfied when required and both screenshot and reference are empty', () => {
    const m = method({ require_payment_proof: true })
    expect(isPaymentProofSatisfied(m, { screenshotUrl: '', reference: '' })).toBe(false)
    expect(isPaymentProofSatisfied(m, { screenshotUrl: '   ', reference: '   ' })).toBe(false)
  })

  test('is satisfied when required and only a screenshot is provided', () => {
    const m = method({ require_payment_proof: true })
    expect(isPaymentProofSatisfied(m, { screenshotUrl: 'https://res.cloudinary.com/x/a.png', reference: '' })).toBe(true)
  })

  test('is satisfied when required and only a reference is provided', () => {
    const m = method({ require_payment_proof: true })
    expect(isPaymentProofSatisfied(m, { screenshotUrl: '', reference: 'REF12345' })).toBe(true)
  })

  test('is satisfied when required and both are provided', () => {
    const m = method({ require_payment_proof: true })
    expect(isPaymentProofSatisfied(m, { screenshotUrl: 'https://x/a.png', reference: 'REF1' })).toBe(true)
  })

  test('is satisfied with no method selected (nothing to enforce)', () => {
    expect(isPaymentProofSatisfied(null, { screenshotUrl: '', reference: '' })).toBe(true)
  })
})

describe('getPaymentProofError', () => {
  test('returns null when satisfied', () => {
    const m = method({ require_payment_proof: true })
    expect(getPaymentProofError(m, { screenshotUrl: 'https://x/a.png', reference: '' })).toBeNull()
  })

  test('returns a user-facing message when required and missing', () => {
    const m = method({ require_payment_proof: true })
    const msg = getPaymentProofError(m, { screenshotUrl: '', reference: '' })
    expect(typeof msg).toBe('string')
    expect(msg).toMatch(/screenshot|reference/i)
  })
})

describe('constants', () => {
  test('exposes a Cloudinary folder for proofs', () => {
    expect(PAYMENT_PROOF_FOLDER).toContain('payment-proof')
  })
})

import { createHmac } from 'crypto'
import {
  computeUploadSignature,
  isDeletablePaymentProofPath,
} from '@/lib/imagekit-signature'

describe('computeUploadSignature', () => {
  test('is HMAC-SHA1 hex of (token + expire) keyed by the private key', () => {
    const token = 'abc-123'
    const expire = 1773650000
    const privateKey = 'private_test_key'

    const expected = createHmac('sha1', privateKey)
      .update(token + String(expire))
      .digest('hex')

    expect(computeUploadSignature(token, expire, privateKey)).toBe(expected)
  })

  test('is deterministic for the same inputs', () => {
    const a = computeUploadSignature('t', 1, 'k')
    const b = computeUploadSignature('t', 1, 'k')
    expect(a).toBe(b)
  })

  test('changes when any input changes', () => {
    const base = computeUploadSignature('t', 1, 'k')
    expect(computeUploadSignature('t2', 1, 'k')).not.toBe(base)
    expect(computeUploadSignature('t', 2, 'k')).not.toBe(base)
    expect(computeUploadSignature('t', 1, 'k2')).not.toBe(base)
  })
})

describe('isDeletablePaymentProofPath', () => {
  test('accepts paths inside the payment-proofs folder', () => {
    expect(isDeletablePaymentProofPath('payment-proofs/abc.jpg')).toBe(true)
  })

  test('rejects paths outside the payment-proofs folder', () => {
    expect(isDeletablePaymentProofPath('menu-items/abc.jpg')).toBe(false)
    expect(isDeletablePaymentProofPath('tenants/logo.png')).toBe(false)
  })

  test('rejects path traversal', () => {
    expect(isDeletablePaymentProofPath('payment-proofs/../menu-items/x.jpg')).toBe(false)
  })

  test('rejects empty and oversized paths', () => {
    expect(isDeletablePaymentProofPath('')).toBe(false)
    expect(isDeletablePaymentProofPath('payment-proofs/' + 'a'.repeat(520))).toBe(false)
  })
})

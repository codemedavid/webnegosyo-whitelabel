import { describe, it, expect } from '@jest/globals'
import { sanitizePaymentProof } from '@/lib/checkout/payment-proof-guard'

/**
 * The proof URL is rendered as a link and an image in the merchant's order
 * screens. It can only legitimately be an ImageKit delivery URL — the checkout
 * uploads there and nowhere else — so anything else is dropped before it is
 * stored.
 */

const ENDPOINT = 'https://ik.imagekit.io/hau6qlmlz'

describe('sanitizePaymentProof', () => {
  it('keeps an ImageKit https URL', () => {
    const url = 'https://ik.imagekit.io/hau6qlmlz/payment-proofs/a.jpg'

    expect(sanitizePaymentProof({ url, publicId: 'f1', reference: 'GC123' }, ENDPOINT)).toEqual({
      url,
      publicId: 'f1',
      reference: 'GC123',
    })
  })

  it('keeps a URL on the configured custom endpoint host', () => {
    const url = 'https://img.example.com/proofs/a.jpg'

    expect(sanitizePaymentProof({ url }, 'https://img.example.com')?.url).toBe(url)
  })

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['plain http', 'http://ik.imagekit.io/hau6qlmlz/a.jpg'],
    ['another host', 'https://evil.example/a.jpg'],
    ['a lookalike host', 'https://ik.imagekit.io.evil.example/a.jpg'],
    ['a host in the userinfo', 'https://ik.imagekit.io@evil.example/a.jpg'],
    ['not a URL', 'not a url'],
    ['a non-string', 42],
  ])('drops %s', (_label, url) => {
    expect(sanitizePaymentProof({ url, reference: 'GC1' }, ENDPOINT)).toEqual({
      url: null,
      publicId: null,
      reference: 'GC1',
    })
  })

  it('bounds the reference and file id', () => {
    const result = sanitizePaymentProof({ reference: 'r'.repeat(900), publicId: 'p'.repeat(900) }, ENDPOINT)

    expect(result?.reference?.length).toBe(500)
    expect(result?.publicId).toBeNull()
  })

  it('answers undefined for no proof at all', () => {
    expect(sanitizePaymentProof(undefined, ENDPOINT)).toBeUndefined()
    expect(sanitizePaymentProof(null, ENDPOINT)).toBeUndefined()
  })
})

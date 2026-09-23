import { createHmac } from 'crypto'
import {
  buildUploadJwt,
  computeUploadSignature,
  detectImageMime,
  isDeletablePaymentProofPath,
  sanitizeUploadFileName,
  sanitizeUploadFolder,
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

describe('isDeletablePaymentProofPath — prefix, not substring', () => {
  test('accepts a leading-slash path as ImageKit reports it', () => {
    expect(isDeletablePaymentProofPath('/payment-proofs/abc.jpg')).toBe(true)
  })

  test('rejects a path that merely contains the folder name elsewhere', () => {
    expect(isDeletablePaymentProofPath('tenants/payment-proofs/logo.png')).toBe(false)
    expect(isDeletablePaymentProofPath('menu-items/payment-proofs-latte.jpg')).toBe(false)
  })
})

describe('buildUploadJwt (ImageKit upload API v2)', () => {
  const privateKey = 'private_test_key'
  const publicKey = 'public_test_key'

  function decode(part: string): Record<string, unknown> {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  }

  test('is an HS256 JWT whose kid is the public key and whose payload binds every upload param', () => {
    const fields = { fileName: 'latte.jpg', folder: 'menu-items', useUniqueFileName: 'true', overwriteFile: 'false' }
    const token = buildUploadJwt(fields, { publicKey, privateKey, nowSec: 1_700_000_000, ttlSec: 600 })

    const [header, payload, signature] = token.split('.')
    expect(decode(header)).toEqual({ alg: 'HS256', typ: 'JWT', kid: publicKey })
    expect(decode(payload)).toEqual({ ...fields, iat: 1_700_000_000, exp: 1_700_000_600 })
    const expected = createHmac('sha256', privateKey).update(`${header}.${payload}`).digest('base64url')
    expect(signature).toBe(expected)
  })

  test('refuses a lifetime ImageKit would reject (over one hour)', () => {
    expect(() => buildUploadJwt({}, { publicKey, privateKey, nowSec: 0, ttlSec: 3601 })).toThrow()
  })
})

describe('sanitizeUploadFolder', () => {
  test('accepts the folders the product uploads to', () => {
    for (const folder of ['tenants', 'tenants/logos', 'menu-items', 'payment-qr-codes', 'variation-options', 'university/covers']) {
      expect(sanitizeUploadFolder(folder)).toBe(folder)
    }
  })

  test('strips leading/trailing slashes', () => {
    expect(sanitizeUploadFolder('/menu-items/')).toBe('menu-items')
  })

  test('rejects traversal, empty and odd characters', () => {
    expect(sanitizeUploadFolder('../tenants')).toBeNull()
    expect(sanitizeUploadFolder('tenants/../menu-items')).toBeNull()
    expect(sanitizeUploadFolder('')).toBeNull()
    expect(sanitizeUploadFolder('menu items')).toBeNull()
    expect(sanitizeUploadFolder('a'.repeat(200))).toBeNull()
  })
})

describe('sanitizeUploadFileName', () => {
  test('keeps an ordinary name', () => {
    expect(sanitizeUploadFileName('latte.jpg')).toBe('latte.jpg')
  })

  test('replaces path separators and odd characters, and bounds the length', () => {
    expect(sanitizeUploadFileName('../../tenants/logo.png')).not.toMatch(/\//)
    expect(sanitizeUploadFileName('x'.repeat(500)).length).toBeLessThanOrEqual(100)
  })

  test('falls back to a default for an empty name', () => {
    expect(sanitizeUploadFileName('')).toBe('upload')
  })
})

describe('detectImageMime (magic bytes)', () => {
  const bytes = (...values: number[]) => new Uint8Array(values)

  test('recognises JPEG, PNG and WEBP by content', () => {
    expect(detectImageMime(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe('image/jpeg')
    expect(detectImageMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0))).toBe('image/png')
    const webp = new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')])
    expect(detectImageMime(webp)).toBe('image/webp')
  })

  test('rejects HTML/SVG/scripts dressed up as images', () => {
    expect(detectImageMime(new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">')))).toBeNull()
    expect(detectImageMime(new Uint8Array(Buffer.from('<!DOCTYPE html><html>')))).toBeNull()
    expect(detectImageMime(bytes())).toBeNull()
  })
})

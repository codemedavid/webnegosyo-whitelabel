/** @jest-environment node */
import { signDeliveryQuote, verifyDeliveryQuote } from '@/lib/checkout/delivery-quote-signature'
import { decodeAppQuoteToken, encodeAppQuoteToken } from '@/lib/app-api/delivery/quote-token'

const SECRET = 'app-quote-token-test-secret'
const NOW = Date.parse('2026-11-04T08:00:00Z')
const TENANT = '00000000-0000-4000-8000-000000000001'
const DESTINATION = { address: '12 Mabini St, Quezon City', lat: 14.65, lng: 121.03 }

function signedToken(overrides: Partial<{ tenantId: string; quotationId: string; fee: number }> = {}) {
  const quotationId = overrides.quotationId ?? 'Q-123'
  const signature = signDeliveryQuote(
    { tenantId: overrides.tenantId ?? TENANT, quotationId, fee: overrides.fee ?? 145, destination: DESTINATION, expiresAt: NOW + 300_000 },
    NOW,
    SECRET,
  )
  if (!signature) throw new Error('signing failed')
  return { token: encodeAppQuoteToken({ quotationId, signature }), signature, quotationId }
}

/** Exactly what the orders route will do with `delivery.quoteToken`. */
function verifyToken(token: unknown, destination: unknown = DESTINATION, tenantId = TENANT) {
  const parts = decodeAppQuoteToken(token)
  return verifyDeliveryQuote(parts?.signature, { tenantId, quotationId: parts?.quotationId, destination }, NOW + 1_000, SECRET)
}

describe('app quote token', () => {
  it('round-trips both halves and verifies to the signed fee', () => {
    const { token, signature, quotationId } = signedToken()
    expect(token).toMatch(/^aq1\.[A-Za-z0-9_-]+$/)
    expect(decodeAppQuoteToken(token)).toEqual({ quotationId, signature })
    expect(verifyToken(token)).toEqual({ ok: true, fee: 145 })
  })

  it('refuses a token whose quotation id was swapped', () => {
    const { signature } = signedToken()
    const forged = encodeAppQuoteToken({ quotationId: 'Q-OTHER', signature })
    expect(verifyToken(forged)).toEqual({ ok: false, reason: 'mismatch' })
  })

  it('refuses a re-written signature body (cheaper fee)', () => {
    const { signature, quotationId } = signedToken()
    const [body, mac] = signature.split('.')
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    const cheaper = Buffer.from(JSON.stringify({ ...payload, fee: 1 })).toString('base64url')
    const forged = encodeAppQuoteToken({ quotationId, signature: `${cheaper}.${mac}` })
    expect(verifyToken(forged)).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('refuses another store’s token and a moved pin', () => {
    const { token } = signedToken({ tenantId: '00000000-0000-4000-8000-000000000002' })
    expect(verifyToken(token)).toEqual({ ok: false, reason: 'mismatch' })
    const mine = signedToken().token
    expect(verifyToken(mine, { ...DESTINATION, lat: 14.7 })).toEqual({ ok: false, reason: 'mismatch' })
  })

  it.each([
    ['not a string', 42],
    ['no prefix', 'eyJxIjoiUSJ9'],
    ['bad base64', 'aq1.***'],
    ['not JSON', `aq1.${Buffer.from('nope').toString('base64url')}`],
    ['missing signature', `aq1.${Buffer.from(JSON.stringify({ q: 'Q-1' })).toString('base64url')}`],
    ['empty quotation', `aq1.${Buffer.from(JSON.stringify({ q: ' ', s: 'a.b' })).toString('base64url')}`],
    ['oversized', `aq1.${'A'.repeat(9000)}`],
  ])('decodes %s to null, which verifies as missing', (_label, token) => {
    expect(decodeAppQuoteToken(token)).toBeNull()
    expect(verifyToken(token)).toEqual({ ok: false, reason: 'missing' })
  })

  it('mints no token from empty halves', () => {
    expect(encodeAppQuoteToken({ quotationId: '', signature: 'a.b' })).toBeNull()
    expect(encodeAppQuoteToken({ quotationId: 'Q-1', signature: '' })).toBeNull()
  })
})

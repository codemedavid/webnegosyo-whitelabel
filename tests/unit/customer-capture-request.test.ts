/**
 * Validating the capture request the merchant app sends after a sale.
 *
 * Background: every customer-capture call site lives in the Next.js app, so an
 * order created by the merchant app — including every POS sale — never built a
 * customer profile at all. The app now posts the order's facts to a route that
 * feeds the existing `upsertCustomerFromOrder` / `captureExternalOrderBestEffort`
 * orchestration. This module is the boundary where that untrusted body becomes
 * something safe to hand to it.
 *
 * The security-critical guarantee is the last one: the body may NOT name a
 * customer. Identity is resolved server-side from the contact details, exactly
 * as it is for a web checkout. A client-supplied `customerId` would let a
 * compromised or buggy register attach a sale to any uuid it liked — including
 * another tenant's guest — and the profile recompute would then quietly restate
 * that stranger's lifetime totals.
 */

import { parseCustomerCaptureRequest } from '@/lib/customer-capture-request'

const VALID = {
  tenantId: 't1',
  backend: 'convex',
  orderId: 'order-1',
  name: 'Maria Santos',
  contact: '09171234567',
  total: 250,
  createdAt: '2026-08-03T10:00:00Z',
  channel: 'Dine-in',
  items: [{ name: 'Latte', quantity: 2 }],
}

/** Unwraps a parse expected to succeed, failing loudly when it did not. */
function parseOk(body: unknown) {
  const result = parseCustomerCaptureRequest(body)
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`)
  return result.value
}

describe('parseCustomerCaptureRequest — required identity of the order', () => {
  it('rejects a body with no tenant', () => {
    // Arrange / Act
    const result = parseCustomerCaptureRequest({ ...VALID, tenantId: undefined })

    // Assert
    expect(result.ok).toBe(false)
  })

  it('rejects a body with no order id', () => {
    const result = parseCustomerCaptureRequest({ ...VALID, orderId: '' })

    expect(result.ok).toBe(false)
  })

  it('rejects a backend it does not know how to capture', () => {
    // An unknown backend would be written into the ledger's identity key, and
    // the same order arriving later under its real name would double-count.
    const result = parseCustomerCaptureRequest({ ...VALID, backend: 'mysql' })

    expect(result.ok).toBe(false)
  })

  it.each(['platform', 'convex', 'tenant_supabase'])('accepts the %s backend', (backend) => {
    expect(parseOk({ ...VALID, backend }).backend).toBe(backend)
  })

  it('rejects a body that is not an object at all', () => {
    expect(parseCustomerCaptureRequest(null).ok).toBe(false)
    expect(parseCustomerCaptureRequest('nope').ok).toBe(false)
  })
})

describe('parseCustomerCaptureRequest — order facts', () => {
  it('coerces a numeric-string total, as JSON bodies deliver them', () => {
    expect(parseOk({ ...VALID, total: '250.50' }).total).toBe(250.5)
  })

  it.each([undefined, null, 'abc', NaN, Infinity])(
    'falls back to a zero total for %s rather than dropping the guest',
    (total) => {
      // An unreadable total understates lifetime spend by one order. Refusing
      // the capture loses the guest entirely, which is the worse of the two.
      expect(parseOk({ ...VALID, total }).total).toBe(0)
    }
  )

  it('clamps a negative total to zero', () => {
    expect(parseOk({ ...VALID, total: -100 }).total).toBe(0)
  })

  it('passes an ISO timestamp through unchanged', () => {
    expect(parseOk(VALID).createdAt).toBe('2026-08-03T10:00:00Z')
  })

  it('accepts epoch milliseconds, which is what Convex reports', () => {
    expect(parseOk({ ...VALID, createdAt: 1_754_215_200_000 }).createdAt).toBe(1_754_215_200_000)
  })

  it('returns a null timestamp when absent, so the server stamps its own', () => {
    // The alternative is trusting a till's clock, which is routinely wrong and
    // would put a sale in the wrong month of the guest's history.
    expect(parseOk({ ...VALID, createdAt: undefined }).createdAt).toBeNull()
  })

  it('nulls a channel that is not a string', () => {
    expect(parseOk({ ...VALID, channel: 42 }).channel).toBeNull()
  })
})

describe('parseCustomerCaptureRequest — line items', () => {
  it('keeps well-formed lines', () => {
    expect(parseOk(VALID).items).toEqual([{ name: 'Latte', quantity: 2 }])
  })

  it('drops malformed lines instead of rejecting the whole capture', () => {
    // One unreadable line must not cost the merchant the guest.
    const items = [
      { name: 'Latte', quantity: 2 },
      { name: '', quantity: 1 },
      { name: 'Bun', quantity: 0 },
      null,
      'garbage',
    ]

    expect(parseOk({ ...VALID, items }).items).toEqual([{ name: 'Latte', quantity: 2 }])
  })

  it('treats a non-array items field as no lines', () => {
    expect(parseOk({ ...VALID, items: 'Latte' }).items).toEqual([])
  })
})

describe('parseCustomerCaptureRequest — identity is resolved, never asserted', () => {
  it('carries the contact details through for server-side resolution', () => {
    const parsed = parseOk({ ...VALID, customerData: { phone: '09171234567' } })

    expect(parsed.name).toBe('Maria Santos')
    expect(parsed.contact).toBe('09171234567')
    expect(parsed.customerData).toEqual({ phone: '09171234567' })
  })

  it('never carries a client-supplied customer id', () => {
    // The one thing a caller must not be able to say. Identity comes from the
    // contact details via the shared resolver; accepting an id here would let a
    // register attach its sale to another tenant's guest and restate that
    // stranger's lifetime totals on the next recompute.
    const parsed = parseOk({ ...VALID, customerId: 'someone-elses-uuid' })

    expect(parsed).not.toHaveProperty('customerId')
  })

  it('nulls a customerData that is not an object', () => {
    // The blob is read structurally downstream for phone/email keys. A string
    // or an array cannot carry those, and passing one through only gives the
    // resolver something to defend against.
    expect(parseOk({ ...VALID, customerData: 'phone: 0917' }).customerData).toBeNull()
    expect(parseOk({ ...VALID, customerData: ['0917'] }).customerData).toBeNull()
  })

  it('accepts an order with no name at all', () => {
    // A phone-only sale is still a guest. Whether the contact identifies anybody
    // is the resolver's call, not this boundary's.
    const parsed = parseOk({ ...VALID, name: undefined })

    expect(parsed.name).toBeNull()
  })
})

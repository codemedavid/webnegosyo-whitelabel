/**
 * The payment method an order carries is the store's, never the browser's.
 *
 * The checkout used to send the method's NAME, account DETAILS and QR URL as
 * strings, and every backend stored them as sent: a forged order could tell
 * the merchant (and the receipt) to expect payment into someone else's
 * account. The server now reads the method by id — the tenant's own, active,
 * linked to the order's type, exactly what the storefront offers — and the
 * stored row is what the order carries. A method that requires proof refuses
 * an order with neither a screenshot nor a reference, the same rule the
 * checkout's preflight (`getPaymentProofError`) applies before "Order Placed!".
 */

import { describe, test, expect } from '@jest/globals'
import {
  judgeOrderPaymentMethod,
  readOrderPaymentMethod,
  PAYMENT_METHOD_UNAVAILABLE_MESSAGE,
  type PaymentMethodRead,
} from '@/lib/checkout/order-payment-method'
import { getPaymentProofError } from '@/lib/payment-proof'

const PM_ID = '11111111-1111-4111-8111-111111111111'
const OT_ID = '22222222-2222-4222-8222-222222222222'

function stored(overrides: Record<string, unknown> = {}): PaymentMethodRead {
  return {
    ok: true,
    row: {
      id: PM_ID,
      name: 'GCash',
      details: '0917 000 0000 — Island Silog',
      qr_code_url: 'https://ik.imagekit.io/x/qr.png',
      is_active: true,
      require_payment_proof: false,
      order_type_ids: [OT_ID],
      ...overrides,
    },
  }
}

const NO_PROOF = { url: null, publicId: null, reference: null }

describe('judgeOrderPaymentMethod', () => {
  test('an order without a method carries none (and no name the browser sent)', () => {
    const verdict = judgeOrderPaymentMethod({ requestedId: undefined, read: { ok: true, row: null }, orderTypeId: OT_ID, proof: undefined })

    expect(verdict).toEqual({ kind: 'ok', method: null })
  })

  test('carries the stored name, details and QR', () => {
    const verdict = judgeOrderPaymentMethod({ requestedId: PM_ID, read: stored(), orderTypeId: OT_ID, proof: undefined })

    expect(verdict).toEqual({
      kind: 'ok',
      method: { id: PM_ID, name: 'GCash', details: '0917 000 0000 — Island Silog', qrCodeUrl: 'https://ik.imagekit.io/x/qr.png' },
    })
  })

  test('refuses a method that is not the store’s', () => {
    const verdict = judgeOrderPaymentMethod({ requestedId: PM_ID, read: { ok: true, row: null }, orderTypeId: OT_ID, proof: undefined })

    expect(verdict).toEqual({ kind: 'refuse', error: PAYMENT_METHOD_UNAVAILABLE_MESSAGE })
  })

  test('refuses a method the merchant switched off', () => {
    const verdict = judgeOrderPaymentMethod({ requestedId: PM_ID, read: stored({ is_active: false }), orderTypeId: OT_ID, proof: undefined })

    expect(verdict.kind).toBe('refuse')
  })

  test('refuses a method not offered for the order type', () => {
    const unlinked = judgeOrderPaymentMethod({ requestedId: PM_ID, read: stored({ order_type_ids: ['other'] }), orderTypeId: OT_ID, proof: undefined })
    const noType = judgeOrderPaymentMethod({ requestedId: PM_ID, read: stored(), orderTypeId: null, proof: undefined })

    expect(unlinked.kind).toBe('refuse')
    expect(noType.kind).toBe('refuse')
  })

  test('a failed read is a lost order, not a refusal (Messenger stays the fallback)', () => {
    const verdict = judgeOrderPaymentMethod({ requestedId: PM_ID, read: { ok: false }, orderTypeId: OT_ID, proof: undefined })

    expect(verdict.kind).toBe('abort')
  })

  describe('proof-required methods', () => {
    const required = stored({ require_payment_proof: true })
    const method = { require_payment_proof: true } as Parameters<typeof getPaymentProofError>[0]

    test.each([
      ['no proof at all', undefined, { screenshotUrl: null, reference: null }],
      ['an empty proof', NO_PROOF, { screenshotUrl: null, reference: null }],
      ['a blank reference', { ...NO_PROOF, reference: null }, { screenshotUrl: '', reference: '   ' }],
    ])('refuses %s with the checkout preflight’s own sentence', (_label, proof, clientView) => {
      const verdict = judgeOrderPaymentMethod({ requestedId: PM_ID, read: required, orderTypeId: OT_ID, proof })

      expect(verdict).toEqual({ kind: 'refuse', error: getPaymentProofError(method, clientView) })
    })

    test('accepts a screenshot', () => {
      const verdict = judgeOrderPaymentMethod({
        requestedId: PM_ID, read: required, orderTypeId: OT_ID,
        proof: { ...NO_PROOF, url: 'https://ik.imagekit.io/x/proof.png' },
      })

      expect(verdict.kind).toBe('ok')
    })

    test('accepts a reference number alone', () => {
      const verdict = judgeOrderPaymentMethod({ requestedId: PM_ID, read: required, orderTypeId: OT_ID, proof: { ...NO_PROOF, reference: 'REF-1' } })

      expect(verdict.kind).toBe('ok')
    })
  })
})

describe('readOrderPaymentMethod', () => {
  interface Read { table: string; columns: string; filters: Array<[string, unknown]> }

  function fakeClient(answer: { data: unknown; error: unknown }) {
    const reads: Read[] = []
    const client = {
      from: (table: string) => {
        const read: Read = { table, columns: '', filters: [] }
        reads.push(read)
        const chain: Record<string, unknown> = {
          select: (columns: string) => { read.columns = columns; return chain },
          eq: (column: string, value: unknown) => { read.filters.push([column, value]); return chain },
          maybeSingle: async () => answer,
        }
        return chain
      },
    }
    return { client, reads }
  }

  test('reads one row by id, scoped to the tenant, with its order-type links', async () => {
    // Arrange
    const { client, reads } = fakeClient({
      data: {
        id: PM_ID, name: 'GCash', details: null, qr_code_url: null, is_active: true, require_payment_proof: true,
        payment_method_order_types: [{ order_type_id: OT_ID }, { order_type_id: null }],
      },
      error: null,
    })

    // Act
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const read = await readOrderPaymentMethod(client as any, 't1', PM_ID)

    // Assert
    expect(reads).toHaveLength(1)
    expect(reads[0].table).toBe('payment_methods')
    expect(reads[0].columns).toContain('payment_method_order_types(order_type_id)')
    expect(reads[0].filters).toEqual(expect.arrayContaining([['id', PM_ID], ['tenant_id', 't1']]))
    expect(read).toEqual({
      ok: true,
      row: {
        id: PM_ID, name: 'GCash', details: null, qr_code_url: null, is_active: true, require_payment_proof: true,
        order_type_ids: [OT_ID],
      },
    })
  })

  test('no id means no read', async () => {
    const { client, reads } = fakeClient({ data: null, error: null })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await readOrderPaymentMethod(client as any, 't1', undefined)).toEqual({ ok: true, row: null })
    expect(reads).toHaveLength(0)
  })

  test('a malformed id is "not the store’s" without a read (a uuid cast error would read as a lost order)', async () => {
    const { client, reads } = fakeClient({ data: null, error: null })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await readOrderPaymentMethod(client as any, 't1', 'pm-1; drop')).toEqual({ ok: true, row: null })
    expect(reads).toHaveLength(0)
  })

  test('a database error is reported, never thrown', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'timeout' } })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await readOrderPaymentMethod(client as any, 't1', PM_ID)).toEqual({ ok: false })
  })

  test('a thrown read is reported, never thrown', async () => {
    const client = { from: () => { throw new Error('network') } }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await readOrderPaymentMethod(client as any, 't1', PM_ID)).toEqual({ ok: false })
  })
})

/**
 * A receipt POST that times out (or drops, or answers 5xx) may still have
 * created the receipt in Loyverse. Treating it as an ordinary failure made the
 * order re-claimable, and the next confirm booked the same sale twice.
 * These pin the two halves of the fix: an ambiguous POST is reported as
 * outcome-unknown, and a retry can look the receipt up by its order label.
 */

import {
  isOutcomeUnknownError,
  LoyverseApiError,
  LOYVERSE_API_BASE,
} from '@/lib/loyverse/client'
import { findLoyverseReceiptForOrder, sendLoyverseReceipt } from '@/lib/loyverse/order-push'

const config = {
  accessToken: 'tok',
  storeId: 'store_1',
  paymentTypeId: 'pay_1',
  pushMode: 'on_confirm' as const,
}

const catalog = { 'mi-1': { baseVariantId: 'var_1', modifierGroups: [] } }
const order = {
  orderNumber: '#07',
  items: [{ menu_item_id: 'mi-1', menu_item_name: 'Americano', addons: [], quantity: 1, price: 120, subtotal: 120 }],
}

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
}

const noSleep = async () => {}

describe('isOutcomeUnknownError', () => {
  it('reads a timeout, a dropped connection and a 5xx as "may have been processed"', () => {
    expect(isOutcomeUnknownError(new LoyverseApiError(0, 'TIMEOUT', 'slow'))).toBe(true)
    expect(isOutcomeUnknownError(new TypeError('fetch failed'))).toBe(true)
    expect(isOutcomeUnknownError(new LoyverseApiError(502, 'HTTP_502', 'bad gateway'))).toBe(true)
  })

  it('reads a refusal Loyverse answered as a definite failure', () => {
    expect(isOutcomeUnknownError(new LoyverseApiError(400, 'BAD_REQUEST', 'x'))).toBe(false)
    expect(isOutcomeUnknownError(new LoyverseApiError(401, 'UNAUTHORIZED', 'x'))).toBe(false)
    expect(isOutcomeUnknownError(new LoyverseApiError(429, 'HTTP_429', 'x'))).toBe(false)
  })
})

describe('sendLoyverseReceipt', () => {
  it('flags a timed-out POST as outcome-unknown', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new LoyverseApiError(0, 'TIMEOUT', 'Loyverse did not answer within 15000ms')
    })

    const result = await sendLoyverseReceipt(config, order, catalog, { fetchImpl, sleep: noSleep })

    expect(result).toMatchObject({ success: false, isOutcomeUnknown: true })
    // POST is never retried on its own.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('does not flag a validation refusal', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(400, { errors: [{ code: 'BAD_REQUEST', details: 'nope' }] }))

    const result = await sendLoyverseReceipt(config, order, catalog, { fetchImpl, sleep: noSleep })

    expect(result).toMatchObject({ success: false })
    expect(result.isOutcomeUnknown).toBeFalsy()
  })
})

describe('findLoyverseReceiptForOrder', () => {
  it('asks Loyverse for this store\'s receipts with the order label since the attempt', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse(200, { receipts: [{ receipt_number: '1-1007', order: '#07', receipt_type: 'SALE' }] }),
    )

    const found = await findLoyverseReceiptForOrder(config, '#07', '2026-10-02T01:00:00.000Z', { fetchImpl })

    expect(found).toEqual({ ok: true, receiptNumber: '1-1007' })
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]))
    expect(`${url.origin}${url.pathname}`).toBe(`${LOYVERSE_API_BASE}/receipts`)
    expect(url.searchParams.get('order')).toBe('#07')
    expect(url.searchParams.get('store_id')).toBe('store_1')
    expect(url.searchParams.get('created_at_min')).toBe('2026-10-02T01:00:00.000Z')
  })

  it('ignores refunds and receipts for another order label', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse(200, {
        receipts: [
          { receipt_number: '1-1009', order: '#07', receipt_type: 'REFUND' },
          { receipt_number: '1-1010', order: '#70', receipt_type: 'SALE' },
        ],
      }),
    )

    expect(await findLoyverseReceiptForOrder(config, '#07', '2026-10-02T01:00:00.000Z', { fetchImpl }))
      .toEqual({ ok: true, receiptNumber: null })
  })

  it('reports a lookup it could not complete, never "not found"', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(503, {}))

    expect(
      await findLoyverseReceiptForOrder(config, '#07', '2026-10-02T01:00:00.000Z', { fetchImpl, sleep: noSleep }),
    ).toMatchObject({ ok: false })
  })
})

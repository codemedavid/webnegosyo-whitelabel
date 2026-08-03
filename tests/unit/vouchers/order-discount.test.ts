/**
 * Persisting a discount across three different order backends.
 *
 * Orders live in Convex for some tenants, the shared platform Postgres for
 * others, and a tenant-owned Postgres for the rest. The Convex schema is
 * deployed PER TENANT — adding a column there reaches only the tenants who have
 * been redeployed, which is why POS payments ride inside the free-form
 * `customerData` blob instead (see webnegosyo-app/lib/pos-order.ts).
 *
 * Discounts take the same route: `customerData.discount` on Convex, real
 * columns on Postgres, and one reader that does not care which it is looking at.
 * `total` is always already NET on every backend — the payload is the
 * breakdown, never the source of the amount charged.
 */

import {
  buildOrderDiscountPayload,
  writeOrderDiscount,
  readOrderDiscount,
} from '@/lib/order-discount'
import type { VoucherApplication } from '@/lib/vouchers/stacking'

function makeApplication(overrides: Partial<VoucherApplication> = {}): VoucherApplication {
  return {
    applied: [],
    rejected: [],
    discountLines: [{ label: '10% off', amount: 20, voucherId: 'v1', code: 'WELCOME10' }],
    discountTotal: 20,
    deliveryDiscount: 0,
    allocationsByLine: { 'line-1': 20 },
    ...overrides,
  }
}

describe('buildOrderDiscountPayload', () => {
  it('carries the total, the lines, and the per-line allocation', () => {
    const payload = buildOrderDiscountPayload(makeApplication())

    expect(payload).toEqual({
      total: 20,
      deliveryDiscount: 0,
      lines: [{ label: '10% off', amount: 20, voucherId: 'v1', code: 'WELCOME10' }],
      allocationsByLine: { 'line-1': 20 },
    })
  })

  it('returns null when nothing was discounted, so an undiscounted order stays clean', () => {
    const payload = buildOrderDiscountPayload(
      makeApplication({ discountLines: [], discountTotal: 0, allocationsByLine: {} }),
    )

    expect(payload).toBeNull()
  })

  it('keeps the delivery portion separate from the line portion', () => {
    const payload = buildOrderDiscountPayload(
      makeApplication({
        discountLines: [{ label: 'Free delivery', amount: 60, voucherId: 'v2', code: 'SHIPFREE' }],
        discountTotal: 60,
        deliveryDiscount: 60,
        allocationsByLine: {},
      }),
    )

    expect(payload).toMatchObject({ total: 60, deliveryDiscount: 60, allocationsByLine: {} })
  })
})

describe('writeOrderDiscount', () => {
  it('nests the payload under `discount` without disturbing existing customerData', () => {
    const customerData = { outlet_id: 'outlet-1', pos: { cashTendered: 500 } }

    const written = writeOrderDiscount(customerData, buildOrderDiscountPayload(makeApplication()))

    expect(written).toMatchObject({
      outlet_id: 'outlet-1',
      pos: { cashTendered: 500 },
      discount: { total: 20 },
    })
  })

  it('does not mutate the customerData it was given', () => {
    const customerData = { outlet_id: 'outlet-1' }
    const snapshot = JSON.parse(JSON.stringify(customerData))

    writeOrderDiscount(customerData, buildOrderDiscountPayload(makeApplication()))

    expect(customerData).toEqual(snapshot)
  })

  it('writes no discount key at all when there is no discount', () => {
    const written = writeOrderDiscount({ outlet_id: 'outlet-1' }, null)

    expect(written).toEqual({ outlet_id: 'outlet-1' })
    expect('discount' in written).toBe(false)
  })

  it('tolerates absent customerData', () => {
    const written = writeOrderDiscount(undefined, buildOrderDiscountPayload(makeApplication()))

    expect(written).toMatchObject({ discount: { total: 20 } })
  })
})

describe('readOrderDiscount', () => {
  it('reads a Convex order from customerData.discount', () => {
    const order = { customerData: { discount: { total: 20, deliveryDiscount: 0, lines: [] } } }

    expect(readOrderDiscount(order)).toMatchObject({ total: 20 })
  })

  it('reads a Postgres order from the discount_data column', () => {
    const order = { discount_data: { total: 35, deliveryDiscount: 0, lines: [] }, discount_total: 35 }

    expect(readOrderDiscount(order)).toMatchObject({ total: 35 })
  })

  it('reads snake_case customer_data, which is what the Postgres row uses', () => {
    const order = { customer_data: { discount: { total: 15, deliveryDiscount: 0, lines: [] } } }

    expect(readOrderDiscount(order)).toMatchObject({ total: 15 })
  })

  it('prefers the column over the blob when a tenant has both', () => {
    // A tenant migrated from Convex to Postgres can carry both. The column is
    // the one reporting queries aggregate, so it is the one that must win.
    const order = {
      discount_data: { total: 35, deliveryDiscount: 0, lines: [] },
      customer_data: { discount: { total: 20, deliveryDiscount: 0, lines: [] } },
    }

    expect(readOrderDiscount(order)).toMatchObject({ total: 35 })
  })

  it('returns null for an order with no discount', () => {
    expect(readOrderDiscount({ customerData: { outlet_id: 'o1' } })).toBeNull()
  })

  it('returns null rather than throwing on a malformed blob', () => {
    // The blob is untyped at the database edge; a reader must never assume.
    expect(readOrderDiscount({ customerData: { discount: 'twenty pesos' } })).toBeNull()
    expect(readOrderDiscount({ customerData: null })).toBeNull()
    expect(readOrderDiscount(null)).toBeNull()
    expect(readOrderDiscount({ discount_data: [] })).toBeNull()
  })

  it('returns null when the payload has no usable total', () => {
    expect(readOrderDiscount({ discount_data: { lines: [] } })).toBeNull()
  })

  it('round-trips what writeOrderDiscount produced', () => {
    const payload = buildOrderDiscountPayload(makeApplication())

    const customerData = writeOrderDiscount({ outlet_id: 'o1' }, payload)

    expect(readOrderDiscount({ customerData })).toEqual(payload)
  })
})

/** @jest-environment node */
import {
  MAX_ORDERS_PER_REQUEST,
  customerKeyForOrder,
  parseOrderCustomersRequest,
  summarizeOrderStamp,
  type OrderLedgerRow,
} from '@/lib/loyalty/order-customers'

function ledger(overrides: Partial<OrderLedgerRow> = {}): OrderLedgerRow {
  return {
    orderId: 'order-1',
    programId: 'prog-1',
    customerKey: 'phone:+639171111111',
    kind: 'earn',
    delta: 1,
    isShadow: false,
    ...overrides,
  }
}

const LIVE = { isLoyaltyLive: true, hasActiveProgram: true }

describe('summarizeOrderStamp', () => {
  it('reports the stamp an order earned', () => {
    const stamp = summarizeOrderStamp([ledger()], { status: 'delivered', ...LIVE })

    expect(stamp).toEqual({ state: 'earned', delta: 1, programId: 'prog-1' })
  })

  it('reports a stamp that was handed back when the order was cancelled', () => {
    const rows = [ledger(), ledger({ kind: 'reverse', delta: -1 })]

    const stamp = summarizeOrderStamp(rows, { status: 'cancelled', ...LIVE })

    expect(stamp.state).toBe('returned')
    expect(stamp.delta).toBe(0)
  })

  it('never counts a shadow row as a stamp — it never touched the balance', () => {
    const stamp = summarizeOrderStamp([ledger({ isShadow: true })], { status: 'delivered', ...LIVE })

    expect(stamp.state).toBe('none')
  })

  it('says an open order will earn once it completes, on a live store', () => {
    const stamp = summarizeOrderStamp([], { status: 'preparing', ...LIVE })

    expect(stamp).toEqual({ state: 'pending', delta: 0, programId: null })
  })

  it('promises nothing on a store that is not live', () => {
    expect(
      summarizeOrderStamp([], { status: 'pending', isLoyaltyLive: false, hasActiveProgram: true }).state
    ).toBe('none')
    expect(
      summarizeOrderStamp([], { status: 'pending', isLoyaltyLive: true, hasActiveProgram: false }).state
    ).toBe('none')
  })

  it('promises nothing on a cancelled or finished order that never earned', () => {
    expect(summarizeOrderStamp([], { status: 'cancelled', ...LIVE }).state).toBe('none')
    expect(summarizeOrderStamp([], { status: 'delivered', ...LIVE }).state).toBe('none')
    expect(summarizeOrderStamp([], { status: 'Completed', ...LIVE }).state).toBe('none')
  })

  it('adds up an order that earned on two cards', () => {
    const rows = [ledger(), ledger({ programId: 'prog-2', delta: 2 })]

    expect(summarizeOrderStamp(rows, { status: 'delivered', ...LIVE }).delta).toBe(3)
  })
})

describe('customerKeyForOrder', () => {
  it('prefers the key the stamp was earned under over the order contact', () => {
    // A receipt claim attaches a number the order row itself never carried.
    const key = customerKeyForOrder([ledger({ customerKey: 'phone:+639170000000' })], '+639171111111')

    expect(key).toBe('phone:+639170000000')
  })

  it('falls back to the order phone when nothing has been earned yet', () => {
    expect(customerKeyForOrder([], '+639171111111')).toBe('phone:+639171111111')
  })

  it('ignores a shadow row, which carries no real card', () => {
    expect(customerKeyForOrder([ledger({ isShadow: true, customerKey: 'phone:+639170000000' })], null)).toBeNull()
  })

  it('is null for an anonymous order', () => {
    expect(customerKeyForOrder([], null)).toBeNull()
  })
})

describe('parseOrderCustomersRequest', () => {
  const order = { orderId: 'o-1', contact: '09171111111', customerData: { a: 1 }, status: 'pending' }

  it('accepts a batch of orders on a known backend', () => {
    const parsed = parseOrderCustomersRequest({ backend: 'convex', orders: [order] })

    expect(parsed).toEqual({ ok: true, value: { backend: 'convex', orders: [order] } })
  })

  it('refuses an unknown backend', () => {
    expect(parseOrderCustomersRequest({ backend: 'mongo', orders: [order] }).ok).toBe(false)
  })

  it('refuses a batch larger than one request may carry', () => {
    const orders = Array.from({ length: MAX_ORDERS_PER_REQUEST + 1 }, (_, i) => ({ ...order, orderId: `o-${i}` }))

    expect(parseOrderCustomersRequest({ backend: 'convex', orders }).ok).toBe(false)
  })

  it('drops orders without an id and de-duplicates the rest', () => {
    const parsed = parseOrderCustomersRequest({
      backend: 'platform_supabase',
      orders: [order, { ...order }, { contact: 'x' }, null],
    })

    expect(parsed.ok && parsed.value.orders).toHaveLength(1)
  })

  it('treats a missing contact, customerData or status as absent, not as an error', () => {
    const parsed = parseOrderCustomersRequest({ backend: 'convex', orders: [{ orderId: 'o-2', customerData: 'nope' }] })

    expect(parsed).toEqual({
      ok: true,
      value: {
        backend: 'convex',
        orders: [{ orderId: 'o-2', contact: null, customerData: null, status: null }],
      },
    })
  })
})

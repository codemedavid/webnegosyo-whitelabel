/**
 * Money by payment method: what was actually received through each method.
 * What is still owed is its own "Unpaid" bucket, never counted under the
 * method the customer picked at checkout.
 */
import { bucketPayments, foldMethodName, methodKey, orderPaymentSlices } from '@/lib/reports/payment-buckets'
import { orderFigures } from '@/lib/reports/sales-model'
import { order, payment } from './report-fixtures'

describe('method identity', () => {
  test('a method row id wins; otherwise the folded name; otherwise unspecified', () => {
    expect(methodKey('m-1', 'GCash')).toBe('id:m-1')
    expect(methodKey(null, '  GCash  Payment ')).toBe('name:gcash payment')
    expect(methodKey(null, '')).toBe('unspecified')
    expect(foldMethodName('G-Cash!')).toBe('g cash')
  })
})

describe('orderPaymentSlices', () => {
  test('split tender: each method gets what went through it', () => {
    const o = order({ total: 300, payments: [payment({ amount: 120, methodId: 'm-gcash', methodName: 'GCash' }), payment({ amount: 180 })] })
    const slices = orderPaymentSlices(o, orderFigures(o))
    expect(slices).toEqual([
      { key: 'id:m-gcash', label: 'GCash', methodId: 'm-gcash', cents: 12000 },
      { key: 'id:m-cash', label: 'Cash', methodId: 'm-cash', cents: 18000 },
    ])
  })

  test('the unpaid remainder is not put under the checkout method', () => {
    const o = order({ total: 300, methodId: 'm-gcash', methodName: 'GCash', payments: [payment({ amount: 100 })] })
    expect(orderPaymentSlices(o, orderFigures(o))).toEqual([{ key: 'id:m-cash', label: 'Cash', methodId: 'm-cash', cents: 10000 }])
  })

  test('paid with no ledger: the whole bill under the order’s own method', () => {
    const o = order({ paymentStatus: 'paid', methodId: null, methodName: 'Pay at cashier' })
    expect(orderPaymentSlices(o, orderFigures(o))).toEqual([
      { key: 'name:pay at cashier', label: 'Pay at cashier', methodId: null, cents: 10000 },
    ])
  })

  test('a settled status covering a short ledger puts the shortfall under the order’s method', () => {
    const o = order({ paymentStatus: 'paid', methodId: 'm-gcash', methodName: 'GCash', payments: [payment({ amount: 40 })] })
    expect(orderPaymentSlices(o, orderFigures(o))).toEqual([
      { key: 'id:m-cash', label: 'Cash', methodId: 'm-cash', cents: 4000 },
      { key: 'id:m-gcash', label: 'GCash', methodId: 'm-gcash', cents: 6000 },
    ])
  })

  test('a refund comes out of the method it went back through; a ledger row without a method uses the order’s', () => {
    const o = order({
      total: 100,
      payments: [payment({ amount: 100, methodId: null, methodName: null }), payment({ kind: 'refund', amount: 30 })],
    })
    expect(orderPaymentSlices(o, orderFigures(o))).toEqual([{ key: 'id:m-cash', label: 'Cash', methodId: 'm-cash', cents: 7000 }])
  })
})

describe('labels', () => {
  test('a ledger row with the method id but no name takes the order’s name for that method', () => {
    const o = order({ methodId: 'm-gcash', methodName: 'GCash', payments: [payment({ methodId: 'm-gcash', methodName: null })] })
    expect(bucketPayments([o]).buckets[0]).toMatchObject({ key: 'id:m-gcash', label: 'GCash', type: 'GCash' })
  })

  test('a nameless later payment never replaces a method’s real name', () => {
    const orders = [
      order({ id: 'a', at: 1, payments: [payment({ methodId: 'g', methodName: 'GCash', at: 1 })] }),
      order({ id: 'b', at: 2, methodId: null, methodName: null, payments: [payment({ methodId: 'g', methodName: null, at: 2 })] }),
    ]
    expect(bucketPayments(orders).buckets[0]).toMatchObject({ key: 'id:g', label: 'GCash', cents: 20000 })
  })
})

describe('bucketPayments', () => {
  test('methods add up to collected; collected − overpaid + unpaid = billed', () => {
    const orders = [
      order({ id: 'a', total: 300, payments: [payment({ amount: 120, methodId: 'm-gcash', methodName: 'GCash' }), payment({ amount: 100 })] }),
      order({ id: 'b', total: 100, payments: [payment({ amount: 130 })] }),
      order({ id: 'c', total: 80, status: 'cancelled', payments: [payment({ amount: 80 })] }),
    ]
    const result = bucketPayments(orders)
    expect(result.buckets.map((b) => [b.key, b.cents, b.orders])).toEqual([
      ['id:m-cash', 23000, 2],
      ['id:m-gcash', 12000, 1],
    ])
    expect(result).toMatchObject({ collectedCents: 35000, unpaidCents: 8000, overpaidCents: 3000 })
  })

  test('labels follow the most recent name a method was paid under', () => {
    const orders = [
      order({ id: 'a', at: 1, payments: [payment({ methodName: 'Gcash', at: 1, methodId: 'g' })] }),
      order({ id: 'b', at: 2, payments: [payment({ methodName: 'GCash (main)', at: 2, methodId: 'g' })] }),
    ]
    expect(bucketPayments(orders).buckets[0]).toMatchObject({ key: 'id:g', label: 'GCash (main)', type: 'GCash' })
  })

  test('two names at the same instant: the first in code-point order wins, whatever order the rows were read in', () => {
    // The SQL report functions read rows in no particular order; the label
    // must not depend on it (parity with report_payments).
    const rows = [
      payment({ methodName: 'Gcash', at: 5, methodId: 'g', amount: 10 }),
      payment({ methodName: 'GCash', at: 5, methodId: 'g', amount: 10 }),
    ]
    const forward = bucketPayments([order({ total: 20, payments: rows })])
    const backward = bucketPayments([order({ total: 20, payments: [...rows].reverse() })])
    expect(forward.buckets[0].label).toBe('GCash')
    expect(backward.buckets[0].label).toBe('GCash')
  })

  test('money settled beyond the ledger is named at the time the order was placed', () => {
    const orders = [
      order({ id: 'a', at: 10, paymentStatus: 'paid', methodId: 'g', methodName: 'GCash (old)', payments: [] }),
      order({ id: 'b', at: 5, payments: [payment({ methodId: 'g', methodName: 'GCash', at: 8 })] }),
    ]
    expect(bucketPayments(orders).buckets[0]).toMatchObject({ key: 'id:g', label: 'GCash (old)', orders: 2 })
  })
})

describe('one method, recorded by id on some orders and by name only on others', () => {
  // Seen live (SeaCook, 2026-10-14): web orders store the Cash method's id,
  // register orders only the word "Cash" — the report showed two "Cash" rows.
  test('a name-only payment joins the one method with that name', () => {
    const orders = [
      order({ id: 'a', paymentStatus: 'paid', total: 100, methodId: 'm-cash', methodName: 'Cash' }),
      order({ id: 'b', paymentStatus: 'paid', total: 50, methodId: null, methodName: ' cash ' }),
    ]
    expect(bucketPayments(orders).buckets).toEqual([
      { key: 'id:m-cash', label: 'Cash', type: 'Cash', methodId: 'm-cash', cents: 15000, orders: 2 },
    ])
  })

  test('two different methods with the same name stay apart, and the name-only money stays on its own', () => {
    const orders = [
      order({ id: 'a', paymentStatus: 'paid', total: 100, methodId: 'm-cash-1', methodName: 'Cash' }),
      order({ id: 'b', paymentStatus: 'paid', total: 70, methodId: 'm-cash-2', methodName: 'Cash' }),
      order({ id: 'c', paymentStatus: 'paid', total: 50, methodId: null, methodName: 'Cash' }),
    ]
    expect(bucketPayments(orders).buckets.map((bucket) => bucket.key)).toEqual(['id:m-cash-1', 'id:m-cash-2', 'name:cash'])
  })

  test('an order paid partly by id and partly by name is one slice, counted once', () => {
    const orders = [
      order({
        id: 'a',
        total: 100,
        methodId: null,
        methodName: 'GCash',
        payments: [
          payment({ amount: 100, methodId: 'm-gcash', methodName: 'GCash' }),
          payment({ amount: 40, methodId: null, methodName: 'gcash' }),
          payment({ kind: 'refund', amount: 40, methodId: 'm-gcash', methodName: 'GCash' }),
        ],
      }),
    ]
    expect(bucketPayments(orders).buckets).toEqual([
      { key: 'id:m-gcash', label: 'GCash', type: 'GCash', methodId: 'm-gcash', cents: 10000, orders: 1 },
    ])
  })

  test('an id used without any name gives no name to join', () => {
    const orders = [
      order({ id: 'a', total: 100, methodId: null, methodName: null, payments: [payment({ amount: 100, methodId: 'm-x', methodName: null })] }),
      order({ id: 'b', paymentStatus: 'paid', total: 50, methodId: null, methodName: 'Not recorded' }),
    ]
    expect(bucketPayments(orders).buckets.map((bucket) => bucket.key).sort()).toEqual(['id:m-x', 'name:not recorded'])
  })
})

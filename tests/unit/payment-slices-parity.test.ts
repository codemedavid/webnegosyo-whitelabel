import { orderMethodSlices as convexSlices } from '../../convex-template/convex/paymentSlices'
import {
  orderMethodSlices as appSlices,
  type AnalyticsPayment,
} from '../../webnegosyo-app/lib/backends/analytics-payment-slices'

/**
 * Payment-method reports split a mixed-tender bill on two backends: the
 * per-store Convex template, and the merchant app for platform-Supabase
 * stores. The two copies are kept apart on purpose (a Convex deployment can
 * only bundle its own files), so this pins them to the same answers: a drift
 * would show one store's GCash as cash only because of where its orders live.
 */
interface ParityCase {
  name: string
  total: number
  paymentMethod?: string
  payments: AnalyticsPayment[]
}

const CASES: ParityCase[] = [
  { name: 'no ledger', total: 300, paymentMethod: 'Cash', payments: [] },
  { name: 'no method, no ledger', total: 300, payments: [] },
  {
    name: 'GCash then cash',
    total: 300,
    paymentMethod: 'Cash',
    payments: [
      { kind: 'charge', amount: 120, method: 'GCash' },
      { kind: 'charge', amount: 180, method: 'Cash' },
    ],
  },
  {
    name: 'part paid',
    total: 300,
    paymentMethod: 'Cash',
    payments: [{ kind: 'charge', amount: 120, method: 'GCash' }],
  },
  {
    name: 'refund netted',
    total: 250,
    paymentMethod: 'GCash',
    payments: [
      { kind: 'charge', amount: 300, method: 'GCash' },
      { kind: 'refund', amount: 50, method: 'GCash' },
    ],
  },
  {
    name: 'unnamed ledger row',
    total: 300,
    paymentMethod: 'Maya',
    payments: [{ kind: 'charge', amount: 100, method: 'GCash' }, { kind: 'charge', amount: 200 }],
  },
  {
    name: 'over-collected, odd centavo',
    total: 100.01,
    paymentMethod: 'Cash',
    payments: [
      { kind: 'charge', amount: 66.67, method: 'GCash' },
      { kind: 'charge', amount: 66.67, method: 'Cash' },
      { kind: 'charge', amount: 66.66, method: 'Maya' },
    ],
  },
  {
    name: 'float centavos',
    total: 0.3,
    paymentMethod: 'Cash',
    payments: [
      { kind: 'charge', amount: 0.1, method: 'GCash' },
      { kind: 'charge', amount: 0.2, method: 'Cash' },
    ],
  },
]

describe('payment-method slices mirrors', () => {
  it.each(CASES)('Convex and the app split "$name" the same way', ({ total, paymentMethod, payments }) => {
    const order = { total, paymentMethod }
    const convexPayments = payments.map(({ kind, amount, method }) => ({
      kind,
      amount,
      ...(method !== undefined ? { paymentMethodName: method } : {}),
    }))

    expect(convexSlices(order, convexPayments)).toEqual(appSlices({ ...order, payments }))
  })

  it('never reports more than the order total', () => {
    for (const { total, paymentMethod, payments } of CASES) {
      const sum = appSlices({ total, paymentMethod, payments }).reduce((acc, s) => acc + Math.round(s.amount * 100), 0)
      expect(sum).toBe(Math.round(total * 100))
    }
  })
})

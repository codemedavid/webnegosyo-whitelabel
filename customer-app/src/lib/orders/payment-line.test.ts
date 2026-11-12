import { VALID_ORDER_DETAIL } from '@/fixtures/contract-fixtures'
import { appOrderDetailSchema, type AppOrderDetail } from '@/lib/contract'
import { paymentLine } from './payment-line'

const order = appOrderDetailSchema.parse(VALID_ORDER_DETAIL)
const withPayment = (paymentStatus: AppOrderDetail['paymentStatus'], paymentMethodName: string | null = 'GCash') => ({
  ...order,
  paymentStatus,
  paymentMethodName,
})

describe('paymentLine', () => {
  it('says what was paid and how', () => {
    expect(paymentLine(withPayment('paid'))).toEqual({ text: 'Paid ₱485 with GCash', tone: 'success' })
  })

  it('says nothing is owed once the order is cancelled (seen on the simulator, 2026-11-12)', () => {
    expect(paymentLine({ ...withPayment('pending', 'G-Cash'), status: 'cancelled' })).toEqual({ text: 'Nothing to pay · this order was cancelled', tone: 'muted' })
  })

  it('tells a pending customer what is still owed', () => {
    expect(paymentLine(withPayment('pending', 'Cash'))).toEqual({ text: '₱485 to pay with Cash', tone: 'muted' })
  })

  it('flags a failed or refunded payment', () => {
    expect(paymentLine(withPayment('failed')).tone).toBe('danger')
    expect(paymentLine(withPayment('refunded')).text).toBe('₱485 refunded to GCash')
  })

  it('does not invent a method the store did not record', () => {
    expect(paymentLine(withPayment('unknown', null))).toEqual({ text: 'Total ₱485', tone: 'muted' })
  })
})

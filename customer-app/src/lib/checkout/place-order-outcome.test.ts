import { AppApiError } from '@/lib/api/app-client'
import { UNCONFIRMED_ORDER_MESSAGE, placeOrderFailure } from './place-order-outcome'

describe('placeOrderFailure', () => {
  it('shows the store’s own words for a refusal', () => {
    expect(placeOrderFailure(new AppApiError('refused', 'We’re closed until 7 AM.'))).toEqual({ kind: 'refused', code: 'refused', message: 'We’re closed until 7 AM.' })
  })

  it('never claims failure when the order may exist: still placing, outage, lost answer, network', () => {
    for (const code of ['conflict', 'unavailable', 'internal'] as const)
      expect(placeOrderFailure(new AppApiError(code, 'x'))).toEqual({ kind: 'unconfirmed', code, message: UNCONFIRMED_ORDER_MESSAGE })
    expect(placeOrderFailure(new TypeError('boom'))).toMatchObject({ kind: 'unconfirmed', code: null })
  })

  it('passes a definite rejection through with its message', () => {
    expect(placeOrderFailure(new AppApiError('rate_limited', 'Too many tries. Wait a minute.'))).toEqual({
      kind: 'rejected',
      code: 'rate_limited',
      message: 'Too many tries. Wait a minute.',
    })
  })
})

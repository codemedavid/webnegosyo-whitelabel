import { deliveryQuoteOutlet } from '@/hooks/checkout/delivery-quote-outlet'

const PINNED = { outlet: { id: 'b1', latitude: 14.55, longitude: 121.02 } }

describe('deliveryQuoteOutlet', () => {
  test('quotes from the chosen branch with its pin', () => {
    expect(deliveryQuoteOutlet([PINNED], 'b1')).toEqual({ id: 'b1', latitude: 14.55, longitude: 121.02 })
  })

  test('no branch picked means the store origin', () => {
    expect(deliveryQuoteOutlet([PINNED], null)).toBeNull()
  })

  test('a picked branch missing from the list still names the branch the order will carry', () => {
    // The order sends selectedOutletId; a quote signed for "no branch" would
    // never match it, and the customer could not fix it by re-quoting.
    expect(deliveryQuoteOutlet([PINNED], 'b2')).toEqual({ id: 'b2', latitude: null, longitude: null })
  })
})

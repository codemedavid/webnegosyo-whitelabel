import type { AppDeliveryQuote } from '@/lib/contract'
import {
  QUOTE_EXPIRY_MARGIN_MS,
  deliveryFeeStatus,
  displayedDeliveryFeeCentavos,
  isQuoteExpired,
  placeToDelivery,
  quoteSummary,
  requoteOutcome,
} from './delivery-quote'

const quote: AppDeliveryQuote = { fee: 49, freeDeliveryMinimum: 500, etaMinutes: 35, quoteToken: null, expiresAt: null, distanceKm: 3.2 }
const NOW = Date.parse('2026-11-04T10:00:00Z')

describe('isQuoteExpired', () => {
  it('never expires a fee the store prices itself', () => {
    expect(isQuoteExpired(quote, NOW)).toBe(false)
  })

  it('expires a courier quote at its time, with a safety margin', () => {
    const at = (ms: number) => ({ expiresAt: new Date(ms).toISOString() })
    expect(isQuoteExpired(at(NOW + 5 * 60_000), NOW)).toBe(false)
    expect(isQuoteExpired(at(NOW + QUOTE_EXPIRY_MARGIN_MS + 1), NOW)).toBe(false)
    expect(isQuoteExpired(at(NOW + QUOTE_EXPIRY_MARGIN_MS), NOW)).toBe(true)
    expect(isQuoteExpired(at(NOW - 1), NOW)).toBe(true)
  })

  it('treats an unreadable expiry as expired', () => {
    expect(isQuoteExpired({ expiresAt: 'soon' }, NOW)).toBe(true)
  })
})

describe('free delivery display', () => {
  it('shows the fee below the minimum and zero at or above it', () => {
    expect(displayedDeliveryFeeCentavos(quote, 49_999)).toBe(4900)
    expect(displayedDeliveryFeeCentavos(quote, 50_000)).toBe(0)
    expect(displayedDeliveryFeeCentavos({ ...quote, freeDeliveryMinimum: null }, 1_000_000)).toBe(4900)
  })

  it('says what the fee is and when it would be free', () => {
    expect(quoteSummary(quote, 30_000)).toBe('₱49 delivery · Free over ₱500 · about 35 min')
    expect(quoteSummary(quote, 60_000)).toBe('Free delivery · about 35 min')
    expect(quoteSummary({ ...quote, freeDeliveryMinimum: null, etaMinutes: null }, 30_000)).toBe('₱49 delivery')
  })
})

describe('requoteOutcome', () => {
  it('places on the same fee and stops to show a different one', () => {
    expect(requoteOutcome({ fee: 120 }, { fee: 120 })).toBe('place')
    expect(requoteOutcome({ fee: 120 }, { fee: 135.5 })).toBe('fee_changed')
  })
})

describe('placeToDelivery', () => {
  it('puts a landmark name in front of its address once', () => {
    expect(placeToDelivery({ name: 'SM North EDSA', address: 'North Ave, Quezon City', lat: 14.65, lng: 121.03 }).address).toBe(
      'SM North EDSA, North Ave, Quezon City',
    )
    expect(placeToDelivery({ name: 'Ayala Triangle', address: 'Ayala Triangle, Makati', lat: 1, lng: 2 }).address).toBe('Ayala Triangle, Makati')
    expect(placeToDelivery({ name: null, address: ' 12 Rizal St ', lat: 1, lng: 2 })).toEqual({ address: '12 Rizal St', lat: 1, lng: 2 })
  })

  it('keeps the address within the contract limit', () => {
    expect(placeToDelivery({ name: null, address: 'x'.repeat(400), lat: 1, lng: 2 }).address).toHaveLength(300)
  })
})

describe('deliveryFeeStatus', () => {
  it('is quoting until the first quote, then ready', () => {
    expect(deliveryFeeStatus({ hasQuote: false, isFetching: true, errorCode: null })).toBe('quoting')
    expect(deliveryFeeStatus({ hasQuote: true, isFetching: false, errorCode: null })).toBe('ready')
  })

  it('tells out-of-area apart from a quote that failed', () => {
    expect(deliveryFeeStatus({ hasQuote: false, isFetching: false, errorCode: 'refused' })).toBe('refused')
    expect(deliveryFeeStatus({ hasQuote: false, isFetching: false, errorCode: 'unavailable' })).toBe('failed')
    expect(deliveryFeeStatus({ hasQuote: true, isFetching: false, errorCode: 'network' })).toBe('failed')
  })

  it('is quoting again while a failed quote is retried', () => {
    expect(deliveryFeeStatus({ hasQuote: false, isFetching: true, errorCode: 'unavailable' })).toBe('quoting')
  })
})

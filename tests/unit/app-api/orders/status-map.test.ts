import { APP_ORDER_STATUSES } from '@/lib/app-contract'
import {
  formatAppOrderNumber,
  isTerminalOrderStatus,
  toAppOrderStatus,
  toAppPaymentStatus,
} from '@/lib/app-api/orders/status-map'

describe('toAppOrderStatus', () => {
  // Every value the three backends write: platform orders_status_ck, the tenant
  // bundle (supabase-order-schema.ts) and Convex orders.status all hold these six.
  it.each(APP_ORDER_STATUSES.map((status) => [status]))('maps the backend status %s to itself', (status) => {
    expect(toAppOrderStatus(status)).toBe(status)
  })

  it('tolerates case, whitespace and the American spelling of cancelled', () => {
    expect(toAppOrderStatus(' Ready ')).toBe('ready')
    expect(toAppOrderStatus('CANCELED')).toBe('cancelled')
  })

  it.each([['completed'], ['out_for_delivery'], [''], [null], [undefined], [7], ['__proto__'], ['constructor']])(
    'reads %p as unknown (null)',
    (raw) => {
      expect(toAppOrderStatus(raw)).toBeNull()
    },
  )
})

describe('toAppPaymentStatus', () => {
  it.each([
    ['pending', 'pending'],
    ['paid', 'paid'],
    ['verified', 'paid'],
    ['settled', 'paid'],
    ['failed', 'failed'],
    ['refunded', 'refunded'],
    ['PAID', 'paid'],
  ])('maps %s to %s', (raw, expected) => {
    expect(toAppPaymentStatus(raw)).toBe(expected)
  })

  it.each([[null], [undefined], [''], ['partial'], ['constructor'], [{}]])('answers unknown for %p', (raw) => {
    expect(toAppPaymentStatus(raw)).toBe('unknown')
  })
})

describe('isTerminalOrderStatus', () => {
  it('is true only for delivered and cancelled', () => {
    expect(APP_ORDER_STATUSES.filter(isTerminalOrderStatus)).toEqual(['delivered', 'cancelled'])
    expect(isTerminalOrderStatus(null)).toBe(false)
  })
})

describe('formatAppOrderNumber', () => {
  it('pads to two digits like the web, without the #', () => {
    expect(formatAppOrderNumber(7)).toBe('07')
    expect(formatAppOrderNumber(42)).toBe('42')
    expect(formatAppOrderNumber(123)).toBe('123')
  })

  it.each([[0], [-1], [1.5], ['07'], [null], [undefined], [Number.NaN]])('is null for %p', (raw) => {
    expect(formatAppOrderNumber(raw)).toBeNull()
  })
})

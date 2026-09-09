import {
  evaluateClaimWindow,
  isClaimWindowOpen,
  CLAIM_WINDOW_CLOSED_MESSAGE,
} from '@/lib/loyalty/claim-window'
import { ONLINE_FULFILLED_STATUSES, REVERSED_STATUSES } from '@/lib/customer-order-facts'

describe('evaluateClaimWindow', () => {
  test('is open while the order is still being worked', () => {
    for (const status of ['pending', 'confirmed', 'preparing', 'ready']) {
      expect(evaluateClaimWindow(status)).toEqual({ state: 'open' })
    }
  })

  test('closes the moment the order is handed over', () => {
    expect(evaluateClaimWindow('delivered')).toEqual({ state: 'closed', reason: 'completed' })
  })

  test('closes for every handed-over synonym the platform records', () => {
    for (const status of ONLINE_FULFILLED_STATUSES) {
      expect(evaluateClaimWindow(status)).toEqual({ state: 'closed', reason: 'completed' })
    }
  })

  test('closes for a cancelled or refunded order', () => {
    for (const status of REVERSED_STATUSES) {
      expect(evaluateClaimWindow(status)).toEqual({ state: 'closed', reason: 'cancelled' })
    }
  })

  test('ignores case and surrounding whitespace', () => {
    expect(evaluateClaimWindow('  Delivered ')).toEqual({ state: 'closed', reason: 'completed' })
    expect(evaluateClaimWindow('READY')).toEqual({ state: 'open' })
  })

  test('an unknown or missing status stays open', () => {
    // A merchant-renamed status is not evidence the order was handed over, and
    // guessing "closed" would lock a customer out of a stamp they are owed.
    expect(evaluateClaimWindow(null)).toEqual({ state: 'open' })
    expect(evaluateClaimWindow(undefined)).toEqual({ state: 'open' })
    expect(evaluateClaimWindow('awaiting_rider')).toEqual({ state: 'open' })
  })

  test('isClaimWindowOpen is the boolean shorthand', () => {
    expect(isClaimWindowOpen('ready')).toBe(true)
    expect(isClaimWindowOpen('delivered')).toBe(false)
  })

  test('the closed message never names the reason a receipt-finder could act on', () => {
    expect(CLAIM_WINDOW_CLOSED_MESSAGE).toMatch(/closed/i)
  })
})

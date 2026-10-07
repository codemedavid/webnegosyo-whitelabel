import fs from 'fs'
import path from 'path'
import {
  buildOrderTrackingPath,
  resolveTrackingRedirect,
  type TrackingRedirectInput,
} from '@/lib/checkout/tracking-redirect'

const SAVED_NO_MESSENGER: TrackingRedirectInput = {
  isCheckoutComplete: true,
  isMessengerEnabled: false,
  messengerUrl: '',
  isMessengerAutoOpen: false,
  hasOpenedMessenger: false,
  isKiosk: false,
  trackingOrderId: 'order-1',
  trackingToken: 'tok-1',
}

describe('buildOrderTrackingPath', () => {
  it('builds the tenant tracking URL with the token as the t param', () => {
    expect(buildOrderTrackingPath('cafe', 'order-1', 'tok-1')).toBe('/cafe/order/order-1?t=tok-1')
  })

  it('encodes the token so it survives the query string', () => {
    expect(buildOrderTrackingPath('cafe', 'order-1', 'a+b/c=')).toBe('/cafe/order/order-1?t=a%2Bb%2Fc%3D')
  })
})

describe('resolveTrackingRedirect', () => {
  it('sends a saved order with Messenger off straight to tracking', () => {
    expect(resolveTrackingRedirect('cafe', SAVED_NO_MESSENGER)).toBe('/cafe/order/order-1?t=tok-1')
  })

  it('keeps the thank-you page while the Messenger countdown is still running', () => {
    expect(
      resolveTrackingRedirect('cafe', {
        ...SAVED_NO_MESSENGER,
        isMessengerEnabled: true,
        messengerUrl: 'https://m.me/cafe',
        isMessengerAutoOpen: true,
        hasOpenedMessenger: false,
      })
    ).toBeNull()
  })

  it('moves on to tracking once Messenger has been opened for the customer', () => {
    expect(
      resolveTrackingRedirect('cafe', {
        ...SAVED_NO_MESSENGER,
        isMessengerEnabled: true,
        messengerUrl: 'https://m.me/cafe',
        isMessengerAutoOpen: true,
        hasOpenedMessenger: true,
      })
    ).toBe('/cafe/order/order-1?t=tok-1')
  })

  it('keeps the thank-you page when the customer must send the Messenger message by hand', () => {
    // Auto-open is off for this order type: the message box on the thank-you
    // screen is the only place the customer can send it from.
    expect(
      resolveTrackingRedirect('cafe', {
        ...SAVED_NO_MESSENGER,
        isMessengerEnabled: true,
        messengerUrl: 'https://m.me/cafe',
        isMessengerAutoOpen: false,
        hasOpenedMessenger: false,
      })
    ).toBeNull()
  })

  it('redirects when Messenger is on but no page is connected to send to', () => {
    expect(
      resolveTrackingRedirect('cafe', { ...SAVED_NO_MESSENGER, isMessengerEnabled: true, messengerUrl: '' })
    ).toBe('/cafe/order/order-1?t=tok-1')
  })

  it('redirects when Messenger is off even if a link was resolved', () => {
    expect(
      resolveTrackingRedirect('cafe', { ...SAVED_NO_MESSENGER, messengerUrl: 'https://m.me/cafe' })
    ).toBe('/cafe/order/order-1?t=tok-1')
  })

  it('keeps the kiosk flow, which returns to the menu for the next guest', () => {
    expect(resolveTrackingRedirect('cafe', { ...SAVED_NO_MESSENGER, isKiosk: true })).toBeNull()
  })

  it('waits until checkout is complete', () => {
    expect(resolveTrackingRedirect('cafe', { ...SAVED_NO_MESSENGER, isCheckoutComplete: false })).toBeNull()
  })

  it('stays on the thank-you page until the save returns a tracking id and token', () => {
    // No id/token = still saving, save failed/refused, or order management is
    // off. In every one of those the confirmation screen is the right place.
    expect(resolveTrackingRedirect('cafe', { ...SAVED_NO_MESSENGER, trackingOrderId: null })).toBeNull()
    expect(resolveTrackingRedirect('cafe', { ...SAVED_NO_MESSENGER, trackingToken: null })).toBeNull()
  })
})

describe('useCheckout — wiring', () => {
  const SOURCE = fs.readFileSync(path.join(process.cwd(), 'src/hooks/useCheckout.ts'), 'utf8')

  it('acts on resolveTrackingRedirect with a history replace', () => {
    expect(SOURCE).toContain('resolveTrackingRedirect(')
    expect(SOURCE).toMatch(/router\.replace\(trackingRedirectPath\)/)
  })

  it('marks Messenger as opened right after the countdown opens it — and only if it did', () => {
    // A blocked popup returns null; leaving for tracking then would strand the
    // order message (see messenger-redirect-wiring.test.ts).
    expect(SOURCE).toMatch(
      /const messengerWindow = window\.open\(messengerUrl[^)]*\)\s*\n\s*if \(!messengerWindow\) return\s*\n\s*messengerWindow\.opener = null\s*\n\s*setHasOpenedMessenger\(true\)/
    )
    expect(SOURCE).toContain('hasOpenedMessenger,')
    expect(SOURCE).toContain('isMessengerAutoOpen: messengerRedirectEnabled')
  })
})

/**
 * The owner's "after the order is placed" setting (instant | countdown | stay)
 * only ever DELAYS a redirect that would have happened today. Every case that
 * stays on the thank-you page today — still saving, lost, refused, kiosk,
 * Messenger still to send — keeps staying, whatever the setting says.
 */

import fs from 'fs'
import path from 'path'

import {
  hasMessengerHandoff,
  resolveConfirmationHandoff,
  resolveTrackingRedirect,
  type TrackingRedirectInput,
} from '@/lib/checkout/tracking-redirect'
import { readConfirmationRedirect, type ConfirmationRedirectSetting } from '@/lib/page-designer/page-mode'

const PATH = '/cafe/order/order-1?t=tok-1'
const INSTANT: ConfirmationRedirectSetting = { mode: 'instant', seconds: 5 }
const COUNTDOWN: ConfirmationRedirectSetting = { mode: 'countdown', seconds: 8 }
const STAY: ConfirmationRedirectSetting = { mode: 'stay', seconds: 5 }
const SETTINGS = [INSTANT, COUNTDOWN, STAY]

const SAVED: TrackingRedirectInput = {
  isCheckoutComplete: true,
  isMessengerEnabled: false,
  messengerUrl: '',
  isMessengerAutoOpen: false,
  hasOpenedMessenger: false,
  isKiosk: false,
  trackingOrderId: 'order-1',
  trackingToken: 'tok-1',
}

const handoff = (input: TrackingRedirectInput, setting: ConfirmationRedirectSetting) =>
  resolveConfirmationHandoff(resolveTrackingRedirect('cafe', input), input, setting)

describe('resolveConfirmationHandoff — the owner setting on a saved order', () => {
  it('instant (and an unset store) goes straight to tracking, as today', () => {
    expect(handoff(SAVED, INSTANT)).toEqual({ kind: 'redirect', path: PATH })
    expect(handoff(SAVED, readConfirmationRedirect({}))).toEqual({ kind: 'redirect', path: PATH })
    expect(handoff(SAVED, readConfirmationRedirect(null))).toEqual({ kind: 'redirect', path: PATH })
  })

  it('countdown keeps the thank-you page for the owner’s seconds, then tracking', () => {
    expect(handoff(SAVED, COUNTDOWN)).toEqual({ kind: 'countdown', path: PATH, seconds: 8 })
  })

  it('stay keeps the thank-you page and still knows where Track order goes', () => {
    expect(handoff(SAVED, STAY)).toEqual({ kind: 'stay', path: PATH })
  })

  it('reads the stored columns (bad values fall back to instant / 5s)', () => {
    expect(handoff(SAVED, readConfirmationRedirect({ confirmation_redirect: 'countdown', confirmation_redirect_seconds: 12 })))
      .toEqual({ kind: 'countdown', path: PATH, seconds: 12 })
    expect(handoff(SAVED, readConfirmationRedirect({ confirmation_redirect: 'countdown', confirmation_redirect_seconds: 999 })))
      .toEqual({ kind: 'countdown', path: PATH, seconds: 5 })
    expect(handoff(SAVED, readConfirmationRedirect({ confirmation_redirect: 'later' }))).toEqual({ kind: 'redirect', path: PATH })
  })
})

describe('resolveConfirmationHandoff — today’s stays are never changed', () => {
  const STAYS_TODAY: ReadonlyArray<[string, TrackingRedirectInput]> = [
    ['still saving', { ...SAVED, trackingOrderId: null, trackingToken: null }],
    ['saved without a token', { ...SAVED, trackingToken: null }],
    ['checkout not complete', { ...SAVED, isCheckoutComplete: false }],
    ['kiosk', { ...SAVED, isKiosk: true }],
    ['Messenger countdown still running', { ...SAVED, isMessengerEnabled: true, messengerUrl: 'https://m.me/cafe', isMessengerAutoOpen: true }],
    ['Messenger sent by hand', { ...SAVED, isMessengerEnabled: true, messengerUrl: 'https://m.me/cafe' }],
  ]

  it.each(STAYS_TODAY)('%s → none under every setting', (_name, input) => {
    for (const setting of SETTINGS) expect(handoff(input, setting)).toEqual({ kind: 'none' })
  })

  it('a Messenger hand-off that has opened Messenger moves on straight away under every setting', () => {
    const opened = { ...SAVED, isMessengerEnabled: true, messengerUrl: 'https://m.me/cafe', isMessengerAutoOpen: true, hasOpenedMessenger: true }
    for (const setting of SETTINGS) expect(handoff(opened, setting)).toEqual({ kind: 'redirect', path: PATH })
  })

  it('Messenger on with no page to send to follows the owner setting', () => {
    expect(handoff({ ...SAVED, isMessengerEnabled: true, messengerUrl: '' }, STAY)).toEqual({ kind: 'stay', path: PATH })
  })
})

describe('hasMessengerHandoff', () => {
  it('needs Messenger on AND a link', () => {
    expect(hasMessengerHandoff({ isMessengerEnabled: true, messengerUrl: 'https://m.me/x' })).toBe(true)
    expect(hasMessengerHandoff({ isMessengerEnabled: true, messengerUrl: '' })).toBe(false)
    expect(hasMessengerHandoff({ isMessengerEnabled: false, messengerUrl: 'https://m.me/x' })).toBe(false)
    expect(hasMessengerHandoff({ isMessengerEnabled: true, messengerUrl: null })).toBe(false)
  })
})

describe('useCheckout — the setting is wired into the one redirect', () => {
  const SOURCE = fs.readFileSync(path.join(process.cwd(), 'src/hooks/useCheckout.ts'), 'utf8')

  it('reads the setting and only replaces on a `redirect` hand-off', () => {
    expect(SOURCE).toContain('resolveConfirmationHandoff(')
    expect(SOURCE).toContain('readConfirmationRedirect(')
    expect(SOURCE).toMatch(/confirmationHandoff\.kind === 'redirect' \? confirmationHandoff\.path : null/)
    expect(SOURCE).toMatch(/router\.replace\(trackingRedirectPath\)/)
  })
})

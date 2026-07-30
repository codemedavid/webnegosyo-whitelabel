/**
 * What a kiosk does differently once the order is placed.
 *
 * Two behaviours, and both of them are about the *next* customer:
 *
 *  - Messenger is suppressed. A counter tablet has no customer Facebook account
 *    to hand off to, and opening Messenger on it would strand the queue on a
 *    logged-out login page — or worse, on the previous customer's inbox.
 *  - The storefront takes itself back to the menu after three seconds, so the
 *    next customer walks up to a menu rather than to a stranger's receipt.
 *
 * The suppression is tested at the exact seam checkout calls (`messenger-
 * availability`), and the return at the hook that owns the timer, so neither
 * test can pass while the real path does something else.
 */

import { renderHook, act } from '@testing-library/react'
import {
  isMessengerEnabledForOrderType,
  isMessengerRedirectEnabledForOrderType,
} from '@/lib/messenger-availability'
import { useKioskReturn } from '@/hooks/use-kiosk-return'

const replace = jest.fn()
const push = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
}))

const MESSENGER_ON = { messenger_enabled: true }
const TENANT_ON = { messenger_redirect_enabled: true }

beforeEach(() => {
  replace.mockClear()
  push.mockClear()
})

// ---- Messenger suppression ------------------------------------------------

describe('Messenger availability in kiosk mode', () => {
  it('is off on a kiosk even when the order type allows Messenger', () => {
    // Arrange / Act
    const enabled = isMessengerEnabledForOrderType(MESSENGER_ON, { isKiosk: true })

    // Assert
    expect(enabled).toBe(false)
  })

  it('never auto-opens Messenger on a kiosk', () => {
    const redirects = isMessengerRedirectEnabledForOrderType(TENANT_ON, MESSENGER_ON, {
      isKiosk: true,
    })

    expect(redirects).toBe(false)
  })

  it('leaves an ordinary customer\'s Messenger handoff alone', () => {
    // Regression guard: the phone flow is what every existing merchant uses.
    expect(isMessengerEnabledForOrderType(MESSENGER_ON, { isKiosk: false })).toBe(true)
    expect(
      isMessengerRedirectEnabledForOrderType(TENANT_ON, MESSENGER_ON, { isKiosk: false })
    ).toBe(true)
  })

  it('behaves exactly as before for callers that know nothing about kiosks', () => {
    // The admin order-type screen calls this with one argument.
    expect(isMessengerEnabledForOrderType(MESSENGER_ON)).toBe(true)
    expect(isMessengerRedirectEnabledForOrderType(TENANT_ON, MESSENGER_ON)).toBe(true)
  })
})

// ---- Automatic return to the menu -----------------------------------------

describe('useKioskReturn', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    act(() => { jest.runOnlyPendingTimers() })
    jest.useRealTimers()
  })

  const renderReturn = (props: {
    isKiosk: boolean
    isCheckoutComplete: boolean
    tenantSlug?: string
  }) =>
    renderHook(
      ({ isKiosk, isCheckoutComplete, tenantSlug = 'acme' }) =>
        useKioskReturn({ isKiosk, isCheckoutComplete, tenantSlug }),
      { initialProps: props }
    )

  const advance = (ms: number) => act(() => { jest.advanceTimersByTime(ms) })

  it('sends the kiosk back to the menu after the order', () => {
    // Arrange
    renderReturn({ isKiosk: true, isCheckoutComplete: true })

    // Act
    advance(3000)

    // Assert
    expect(replace).toHaveBeenCalledWith('/acme/menu?kiosk=1')
  })

  it('still returns when React re-renders between ticks', () => {
    // Regression: the effect once depended on the router object. Because that
    // identity is not stable, every re-render restarted the countdown and its
    // timers, so a real kiosk counted "3, 3, 3…" and never went back to the
    // menu. Advancing a second at a time lets a render land between ticks,
    // which advancing the full delay in one call does not.
    renderReturn({ isKiosk: true, isCheckoutComplete: true })

    advance(1000)
    advance(1000)
    advance(1000)

    expect(replace).toHaveBeenCalledWith('/acme/menu?kiosk=1')
  })

  it('leaves the confirmation up long enough to read', () => {
    renderReturn({ isKiosk: true, isCheckoutComplete: true })

    advance(2000)

    expect(replace).not.toHaveBeenCalled()
  })

  it('replaces rather than pushes, so Back cannot reopen a stranger\'s receipt', () => {
    renderReturn({ isKiosk: true, isCheckoutComplete: true })

    advance(3000)

    expect(push).not.toHaveBeenCalled()
  })

  it('returns to the menu still in kiosk mode, ready for the next customer', () => {
    renderReturn({ isKiosk: true, isCheckoutComplete: true })

    advance(3000)

    expect(replace).toHaveBeenCalledWith(expect.stringContaining('kiosk=1'))
  })

  it('returns to the tenant that took the order', () => {
    renderReturn({ isKiosk: true, isCheckoutComplete: true, tenantSlug: 'lucky-joy' })

    advance(3000)

    expect(replace).toHaveBeenCalledWith('/lucky-joy/menu?kiosk=1')
  })

  it('never navigates for a customer ordering on their own phone', () => {
    renderReturn({ isKiosk: false, isCheckoutComplete: true })

    advance(10000)

    expect(replace).not.toHaveBeenCalled()
  })

  it('does not navigate while the customer is still ordering', () => {
    renderReturn({ isKiosk: true, isCheckoutComplete: false })

    advance(10000)

    expect(replace).not.toHaveBeenCalled()
  })

  it('counts the customer down from three', () => {
    const { result } = renderReturn({ isKiosk: true, isCheckoutComplete: true })

    expect(result.current.countdown).toBe(3)
  })

  it('ticks the countdown down each second', () => {
    const { result } = renderReturn({ isKiosk: true, isCheckoutComplete: true })

    advance(1000)

    expect(result.current.countdown).toBe(2)
  })

  it('shows no countdown to a customer on their own phone', () => {
    const { result } = renderReturn({ isKiosk: false, isCheckoutComplete: true })

    expect(result.current.countdown).toBeNull()
  })

  it('stops its timer when the screen goes away', () => {
    // A stray timer firing after unmount would navigate a customer mid-order.
    const { unmount } = renderReturn({ isKiosk: true, isCheckoutComplete: true })

    unmount()
    advance(5000)

    expect(replace).not.toHaveBeenCalled()
  })

  it('navigates once, not once per tick', () => {
    renderReturn({ isKiosk: true, isCheckoutComplete: true })

    advance(9000)

    expect(replace).toHaveBeenCalledTimes(1)
  })
})

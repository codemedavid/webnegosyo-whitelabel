/**
 * Wiring kiosk mode to the browser: the `?kiosk=` param and localStorage.
 *
 * Every decision comes from `resolveKioskMode` — this hook only supplies the
 * inputs and persists the answer. What is worth testing here is the part the
 * pure module cannot see: that a tablet stays in kiosk mode on the cart and
 * checkout pages, which are reached by router.push and therefore arrive with
 * no query string at all.
 */

import { renderHook, waitFor } from '@testing-library/react'
import { useKioskMode } from '@/hooks/use-kiosk-mode'
import { KIOSK_STORAGE_KEY_PREFIX } from '@/lib/kiosk/kiosk-mode'

let searchParams = new URLSearchParams()

jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}))

const storageKey = (tenantSlug: string) => `${KIOSK_STORAGE_KEY_PREFIX}${tenantSlug}`

beforeEach(() => {
  searchParams = new URLSearchParams()
  window.localStorage.clear()
})

describe('useKioskMode', () => {
  it('turns on when the tablet opens the storefront with ?kiosk=1', async () => {
    // Arrange
    searchParams = new URLSearchParams('kiosk=1')

    // Act
    const { result } = renderHook(() => useKioskMode('acme'))

    // Assert
    await waitFor(() => expect(result.current.isKiosk).toBe(true))
  })

  it('remembers the mode so the cart and checkout stay in kiosk mode', async () => {
    searchParams = new URLSearchParams('kiosk=1')

    renderHook(() => useKioskMode('acme'))

    await waitFor(() => expect(window.localStorage.getItem(storageKey('acme'))).toBe('1'))
  })

  it('is still on for a page reached without the param', async () => {
    // How checkout is actually reached: router.push drops the query string.
    window.localStorage.setItem(storageKey('acme'), '1')

    const { result } = renderHook(() => useKioskMode('acme'))

    await waitFor(() => expect(result.current.isKiosk).toBe(true))
  })

  it('is off for an ordinary customer on their phone', async () => {
    const { result } = renderHook(() => useKioskMode('acme'))

    await waitFor(() => expect(result.current.isHydrated).toBe(true))
    expect(result.current.isKiosk).toBe(false)
  })

  it('lets ?kiosk=0 take the tablet back out of kiosk mode', async () => {
    window.localStorage.setItem(storageKey('acme'), '1')
    searchParams = new URLSearchParams('kiosk=0')

    const { result } = renderHook(() => useKioskMode('acme'))

    await waitFor(() => expect(result.current.isKiosk).toBe(false))
  })

  it('forgets the flag when the tablet leaves kiosk mode', async () => {
    window.localStorage.setItem(storageKey('acme'), '1')
    searchParams = new URLSearchParams('kiosk=0')

    renderHook(() => useKioskMode('acme'))

    await waitFor(() => expect(window.localStorage.getItem(storageKey('acme'))).toBeNull())
  })

  it('does not put one tenant\'s storefront into another tenant\'s kiosk mode', async () => {
    window.localStorage.setItem(storageKey('acme'), '1')

    const { result } = renderHook(() => useKioskMode('other-shop'))

    await waitFor(() => expect(result.current.isHydrated).toBe(true))
    expect(result.current.isKiosk).toBe(false)
  })
})

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { KIOSK_RETURN_DELAY_MS, kioskReturnPath } from '@/lib/kiosk/kiosk-mode'

const TICK_MS = 1000

/**
 * After an order on a kiosk, take the storefront back to the menu.
 *
 * A counter tablet serves a queue, not a person: left alone it would sit on one
 * customer's receipt until a staff member noticed. The countdown is exposed so
 * the confirmation screen can say what is about to happen rather than moving
 * under the customer without warning.
 *
 * `replace`, not `push` — a Back tap must not reopen a stranger's receipt.
 *
 * Safe to call unconditionally: with `isKiosk` false it starts no timer and
 * never navigates, so the phone flow runs exactly the code it runs today.
 */
export function useKioskReturn({
  isKiosk,
  isCheckoutComplete,
  tenantSlug,
}: {
  isKiosk: boolean
  isCheckoutComplete: boolean
  tenantSlug: string
}): { countdown: number | null } {
  const router = useRouter()
  const [countdown, setCountdown] = useState<number | null>(null)

  // The router is held in a ref rather than listed as a dependency. Its
  // identity is not guaranteed to be stable, and a router that changed identity
  // would restart this effect on every render — resetting the countdown and its
  // timers forever, so the kiosk would never actually return to the menu.
  const routerRef = useRef(router)
  useEffect(() => {
    routerRef.current = router
  })

  useEffect(() => {
    if (!isKiosk || !isCheckoutComplete) {
      setCountdown(null)
      return
    }

    setCountdown(Math.round(KIOSK_RETURN_DELAY_MS / TICK_MS))

    // The interval only drives the display; the single timeout owns the
    // navigation, so it happens exactly once at exactly the delay.
    const interval = setInterval(() => {
      setCountdown((previous) => (previous === null || previous <= 0 ? 0 : previous - 1))
    }, TICK_MS)

    const timeout = setTimeout(() => {
      clearInterval(interval)
      setCountdown(0)
      routerRef.current.replace(kioskReturnPath(tenantSlug))
    }, KIOSK_RETURN_DELAY_MS)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [isKiosk, isCheckoutComplete, tenantSlug])

  return { countdown }
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import type { LoyaltyOffer } from '@/lib/loyalty/offer'
import type { OrderStampCard } from '@/lib/loyalty/stamp-status'

export interface LoyaltyProgressState {
  /** What the store promises today, or null when it promises nothing. */
  offer: LoyaltyOffer | null
  /** The typed number's standing, or null while unknown. */
  card: OrderStampCard | null
  isLoading: boolean
  error?: string | null
  refresh?: () => void
}

interface UseLoyaltyProgressInput {
  tenantId: string | null | undefined
  /** The canonical E.164 number, or null while the field is incomplete. */
  phone: string | null
  outletId?: string | null
  /** Skipped entirely when the surface has no reason to ask. Defaults to true. */
  enabled?: boolean
}

/** Keystrokes are not questions; wait for the number to settle before asking. */
const SETTLE_MS = 500

const EMPTY: LoyaltyProgressState = { offer: null, card: null, isLoading: false }

/**
 * The customer's own stamp card, looked up from the number they just typed.
 *
 * Deliberately forgetful: the moment the field changes, the previous number's
 * card is dropped rather than left on screen, because a card shown next to a
 * different number is worse than no card at all.
 */
export function useLoyaltyProgress({
  tenantId,
  phone,
  outletId = null,
  enabled = true,
}: UseLoyaltyProgressInput): LoyaltyProgressState {
  const [result, setResult] = useState<{ key: string | null; state: LoyaltyProgressState }>({ key: null, state: EMPTY })
  const [reload, setReload] = useState(0)
  const refresh = useCallback(() => setReload(value => value + 1), [])
  const isAsking = enabled && Boolean(tenantId) && phone !== null
  const key = isAsking ? JSON.stringify([tenantId, phone, outletId]) : null

  useEffect(() => {
    const setState = (state: LoyaltyProgressState) => setResult({ key, state })
    if (!isAsking) {
      setState(EMPTY)
      return
    }

    let cancelled = false
    let inFlight = false
    let attempts = 0
    let controller: AbortController | undefined
    let timer: ReturnType<typeof setTimeout>
    setResult(previous => ({ key, state: previous.key === key ? previous.state : { ...EMPTY, isLoading: true } }))

    const read = async () => {
      if (cancelled || inFlight) return
      clearTimeout(timer)
      inFlight = true
      attempts++
      controller = new AbortController()
      const timeout = setTimeout(() => controller?.abort(), 15000)
      try {
        const res = await fetch('/api/loyalty/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, phone, outletId }),
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!res.ok) throw new Error('unavailable')
        const body = await res.json()
        if (cancelled) return
        setState({
          offer: (body?.offer ?? null) as LoyaltyOffer | null,
          card: (body?.card ?? null) as OrderStampCard | null,
          isLoading: false,
          error: null,
        })
      } catch {
        if (!cancelled) setResult(previous => ({ key, state: {
          ...(previous.key === key ? previous.state : EMPTY),
          isLoading: false,
          error: 'Could not refresh your stamps. Try again.',
        } }))
      } finally {
        clearTimeout(timeout)
        inFlight = false
        if (!cancelled && attempts < 12) timer = setTimeout(read, 30000)
      }
    }
    const resume = () => { attempts = 0; void read() }
    const visible = () => { if (document.visibilityState === 'visible') resume() }
    timer = setTimeout(read, SETTLE_MS)
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', visible)

    return () => {
      cancelled = true
      controller?.abort()
      clearTimeout(timer)
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [tenantId, phone, outletId, isAsking, key, reload])

  // Effects run after commit. Guard during render as well so a changed identity
  // can never display the previous customer's balance for even one frame.
  if (!isAsking) return EMPTY
  return { ...(result.key === key ? result.state : { ...EMPTY, isLoading: true }), refresh }
}

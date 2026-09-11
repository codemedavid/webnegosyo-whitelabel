'use client'

import { useEffect, useState } from 'react'
import type { LoyaltyOffer } from '@/lib/loyalty/offer'
import type { OrderStampCard } from '@/lib/loyalty/stamp-status'

export interface LoyaltyProgressState {
  /** What the store promises today, or null when it promises nothing. */
  offer: LoyaltyOffer | null
  /** The typed number's standing, or null while unknown. */
  card: OrderStampCard | null
  isLoading: boolean
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
  const [state, setState] = useState<LoyaltyProgressState>(EMPTY)
  const isAsking = enabled && Boolean(tenantId) && phone !== null

  useEffect(() => {
    if (!isAsking) {
      setState(EMPTY)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setState({ offer: null, card: null, isLoading: true })

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/loyalty/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, phone, outletId }),
          signal: controller.signal,
        })
        const body = res.ok ? await res.json() : null
        if (cancelled) return
        setState({
          offer: (body?.offer ?? null) as LoyaltyOffer | null,
          card: (body?.card ?? null) as OrderStampCard | null,
          isLoading: false,
        })
      } catch {
        // A card that cannot be read is simply not shown; the order still works.
        if (!cancelled) setState(EMPTY)
      }
    }, SETTLE_MS)

    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(timer)
    }
  }, [tenantId, phone, outletId, isAsking])

  return state
}

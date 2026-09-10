'use client'

import { useCallback, useEffect, useState } from 'react'
import type { OrderStampCard } from '@/lib/loyalty/stamp-status'
import type { ClaimWindow } from '@/lib/loyalty/claim-window'

export interface OrderStampsState {
  claim: ClaimWindow
  hasContact: boolean
  card: OrderStampCard | null
}

interface UseOrderStampsInput {
  orderId: string
  tenantId: string
  trackingToken: string
  /** Skipped entirely when the store has no live loyalty offer. */
  enabled: boolean
  /** Re-read whenever this changes — a delivery is when the stamp lands. */
  status: string
}

/**
 * The order's live loyalty state, read from `/api/orders/stamps`.
 *
 * Why a read at all: the claim reply is a single moment, and the stamp itself
 * usually lands LATER, when the merchant completes the order. Without this the
 * customer's own refresh showed them nothing.
 */
export function useOrderStamps({
  orderId,
  tenantId,
  trackingToken,
  enabled,
  status,
}: UseOrderStampsInput): { stamps: OrderStampsState | null; refresh: () => void } {
  const [stamps, setStamps] = useState<OrderStampsState | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const refresh = useCallback(() => setReloadKey((key) => key + 1), [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const params = new URLSearchParams({ orderId, tenantId, token: trackingToken })
    fetch(`/api/orders/stamps?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled || !body?.success) return
        setStamps({
          claim: body.claim as ClaimWindow,
          hasContact: body.hasContact === true,
          card: (body.card ?? null) as OrderStampCard | null,
        })
      })
      // The page must never fail over a loyalty read; the card simply stays
      // on whatever the server rendered.
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [orderId, tenantId, trackingToken, enabled, status, reloadKey])

  return { stamps, refresh }
}

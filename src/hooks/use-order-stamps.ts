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
  initialStamps?: OrderStampsState | null
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
  initialStamps = null,
}: UseOrderStampsInput): { stamps: OrderStampsState | null; refresh: () => void } {
  const [stamps, setStamps] = useState<OrderStampsState | null>(initialStamps)
  const [reloadKey, setReloadKey] = useState(0)

  const refresh = useCallback(() => setReloadKey((key) => key + 1), [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const params = new URLSearchParams({ orderId, tenantId, token: trackingToken })
    const read = async () => {
      try {
        const res = await fetch(`/api/orders/stamps?${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const body = res.ok ? await res.json() : null
        if (!cancelled && body?.success) {
          setStamps({
            claim: body.claim as ClaimWindow,
            hasContact: body.hasContact === true,
            card: (body.card ?? null) as OrderStampCard | null,
          })
        }
      } catch {
        // Keep the last known card if loyalty is temporarily unavailable.
      } finally {
        // Earning can settle after the final status poll; keep the open page
        // current even when the order status no longer changes.
        if (!cancelled) timer = setTimeout(read, 10000)
      }
    }
    void read()

    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(timer)
    }
  }, [orderId, tenantId, trackingToken, enabled, status, reloadKey])

  return { stamps, refresh }
}

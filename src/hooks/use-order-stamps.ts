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
}: UseOrderStampsInput): { stamps: OrderStampsState | null; refresh: () => void; error: string | null; isLoading: boolean } {
  const key = JSON.stringify([orderId, tenantId, trackingToken])
  const [result, setResult] = useState<{ key: string; stamps: OrderStampsState | null; error: string | null; isLoading: boolean }>(() => ({ key, stamps: initialStamps, error: null, isLoading: false }))
  const [reloadKey, setReloadKey] = useState(0)
  const refresh = useCallback(() => setReloadKey(value => value + 1), [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let inFlight = false
    let attempts = 0
    let controller: AbortController | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    setResult(previous => previous.key === key ? previous : { key, stamps: null, error: null, isLoading: true })
    const params = new URLSearchParams({ orderId, tenantId, token: trackingToken })
    const read = async () => {
      if (cancelled || inFlight) return
      clearTimeout(timer)
      inFlight = true
      attempts++
      controller = new AbortController()
      const timeout = setTimeout(() => controller?.abort(), 15000)
      try {
        const res = await fetch(`/api/orders/stamps?${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!res.ok) throw new Error('unavailable')
        const body = await res.json()
        if (!body?.success) throw new Error('unavailable')
        if (!cancelled) setResult({ key, error: null, isLoading: false, stamps: {
          claim: body.claim as ClaimWindow,
          hasContact: body.hasContact === true,
          card: (body.card ?? null) as OrderStampCard | null,
        } })
      } catch {
        if (!cancelled) setResult(previous => ({ key,
          stamps: previous.key === key ? previous.stamps : null,
          error: 'Could not refresh your stamps. Try again.', isLoading: false,
        }))
      } finally {
        clearTimeout(timeout)
        inFlight = false
        // Stop background work after two minutes; focus, reconnect, status
        // changes and explicit refresh each start a fresh bounded window.
        if (!cancelled && attempts < 12) timer = setTimeout(read, 10000)
      }
    }
    const resume = () => { attempts = 0; void read() }
    const visible = () => { if (document.visibilityState === 'visible') resume() }
    void read()
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
  }, [orderId, tenantId, trackingToken, key, enabled, status, reloadKey])

  return {
    stamps: enabled && result.key === key ? result.stamps : null,
    error: enabled && result.key === key ? result.error : null,
    isLoading: enabled && (result.key !== key || result.isLoading),
    refresh,
  }
}

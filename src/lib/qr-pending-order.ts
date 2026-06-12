// Local persistence for QR-handoff pending orders.
//
// When a customer checks out with QR-handoff enabled, the order is NOT written
// to any server. Instead the encoded payload is stashed in localStorage keyed
// by tenant slug, so the thank-you page can render the QR and poll for status.
// The vendor scanner app is the sole writer of the actual order.
//
// All access is wrapped in try/catch and guarded for SSR (typeof window).

import type { QrOrderPayloadV1 } from '@/types/qr-order'

export interface PendingOrderRecord {
  payload: QrOrderPayloadV1
  qrString: string
  createdAt: number
  lastStatus: string
}

/** Map of clientOrderId (cid) -> PendingOrderRecord, persisted per tenant. */
type PendingOrderMap = Record<string, PendingOrderRecord>

const STORAGE_KEY_PREFIX = 'qr_pending_order_'

function getStorageKey(tenantSlug: string): string {
  return `${STORAGE_KEY_PREFIX}${tenantSlug}`
}

function readMap(tenantSlug: string): PendingOrderMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(getStorageKey(tenantSlug))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as PendingOrderMap
    }
    return {}
  } catch (error) {
    console.error('[qr-pending-order] Failed to read pending orders:', error)
    return {}
  }
}

function writeMap(tenantSlug: string, map: PendingOrderMap): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(getStorageKey(tenantSlug), JSON.stringify(map))
  } catch (error) {
    console.error('[qr-pending-order] Failed to write pending orders:', error)
  }
}

/** Save (or overwrite) a pending order record, keyed by its cid. */
export function savePendingOrder(tenantSlug: string, record: PendingOrderRecord): void {
  if (typeof window === 'undefined') return
  try {
    const map = readMap(tenantSlug)
    map[record.payload.cid] = record
    writeMap(tenantSlug, map)
  } catch (error) {
    console.error('[qr-pending-order] Failed to save pending order:', error)
  }
}

/** Look up a pending order by its clientOrderId (cid). Returns null if missing. */
export function getPendingOrderByCid(tenantSlug: string, cid: string): PendingOrderRecord | null {
  if (typeof window === 'undefined') return null
  try {
    const map = readMap(tenantSlug)
    return map[cid] ?? null
  } catch (error) {
    console.error('[qr-pending-order] Failed to read pending order:', error)
    return null
  }
}

/** Update the cached status for a pending order. No-op if the cid is unknown. */
export function updatePendingStatus(tenantSlug: string, cid: string, status: string): void {
  if (typeof window === 'undefined') return
  try {
    const map = readMap(tenantSlug)
    const existing = map[cid]
    if (!existing) return
    if (existing.lastStatus === status) return
    map[cid] = { ...existing, lastStatus: status }
    writeMap(tenantSlug, map)
  } catch (error) {
    console.error('[qr-pending-order] Failed to update pending status:', error)
  }
}

/** Remove a pending order from local storage (e.g. after the customer dismisses it). */
export function clearPendingOrder(tenantSlug: string, cid: string): void {
  if (typeof window === 'undefined') return
  try {
    const map = readMap(tenantSlug)
    if (!(cid in map)) return
    delete map[cid]
    writeMap(tenantSlug, map)
  } catch (error) {
    console.error('[qr-pending-order] Failed to clear pending order:', error)
  }
}

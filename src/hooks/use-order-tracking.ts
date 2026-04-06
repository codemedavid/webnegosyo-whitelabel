'use client'

import { useState, useEffect, useCallback } from 'react'

export interface ActiveOrder {
  orderId: string
  trackingToken: string
  createdAt: string
  status?: string
  statusUpdatedAt?: string
}

const STORAGE_PREFIX = 'active_orders_'

/** Max time (ms) an order can sit in a given status before the banner auto-expires. */
const STAGE_EXPIRY_MS: Record<string, number> = {
  pending:   30 * 60 * 1000, // 30 min
  confirmed: 60 * 60 * 1000, // 60 min
  preparing: 90 * 60 * 1000, // 90 min
  ready:     60 * 60 * 1000, // 60 min
}
const FALLBACK_EXPIRY_MS = 60 * 60 * 1000 // 60 min default

/** Returns true if the order is still considered active (not stage-expired). */
export function isOrderFresh(order: ActiveOrder): boolean {
  const now = Date.now()
  const status = order.status ?? 'pending'

  // Terminal statuses are never "fresh" for banner purposes
  if (status === 'delivered' || status === 'cancelled') return false

  const anchor = order.statusUpdatedAt
    ? new Date(order.statusUpdatedAt).getTime()
    : new Date(order.createdAt).getTime()

  const maxAge = STAGE_EXPIRY_MS[status] ?? FALLBACK_EXPIRY_MS
  return now - anchor < maxAge
}

export function getStorageKey(tenantSlug: string): string {
  return `${STORAGE_PREFIX}${tenantSlug}`
}

function readOrders(tenantSlug: string): ActiveOrder[] {
  try {
    const raw = localStorage.getItem(getStorageKey(tenantSlug))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    // Validate each entry
    return parsed.filter(
      (entry: unknown): entry is ActiveOrder =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as ActiveOrder).orderId === 'string' &&
        typeof (entry as ActiveOrder).trackingToken === 'string' &&
        typeof (entry as ActiveOrder).createdAt === 'string'
    )
  } catch {
    return []
  }
}

function writeOrders(tenantSlug: string, orders: ActiveOrder[]): void {
  try {
    if (orders.length === 0) {
      localStorage.removeItem(getStorageKey(tenantSlug))
    } else {
      localStorage.setItem(getStorageKey(tenantSlug), JSON.stringify(orders))
    }
  } catch {
    // localStorage may be full or unavailable
  }
}

export function useOrderTracking(tenantSlug: string) {
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([])

  // Read and clean up stale orders on mount
  useEffect(() => {
    const orders = readOrders(tenantSlug)
    const fresh = orders.filter(o => isOrderFresh(o))

    if (fresh.length !== orders.length) {
      writeOrders(tenantSlug, fresh)
    }
    setActiveOrders(fresh)
  }, [tenantSlug])

  const addOrder = useCallback((orderId: string, trackingToken: string) => {
    setActiveOrders(prev => {
      // Avoid duplicates
      if (prev.some(o => o.orderId === orderId)) return prev
      const next = [...prev, { orderId, trackingToken, createdAt: new Date().toISOString() }]
      writeOrders(tenantSlug, next)
      return next
    })
  }, [tenantSlug])

  const removeOrder = useCallback((orderId: string) => {
    setActiveOrders(prev => {
      const next = prev.filter(o => o.orderId !== orderId)
      writeOrders(tenantSlug, next)
      return next
    })
  }, [tenantSlug])

  const hasActiveOrders = activeOrders.length > 0

  return { activeOrders, addOrder, removeOrder, hasActiveOrders }
}

/**
 * Standalone helper to save an order to localStorage without using the hook.
 * Used in checkout's fire-and-forget callback where hooks aren't available.
 */
export function saveActiveOrder(tenantSlug: string, orderId: string, trackingToken: string): void {
  const orders = readOrders(tenantSlug)
  if (orders.some(o => o.orderId === orderId)) return
  const now = new Date().toISOString()
  orders.push({ orderId, trackingToken, createdAt: now, status: 'pending', statusUpdatedAt: now })
  writeOrders(tenantSlug, orders)
}

/**
 * Update the status (and statusUpdatedAt) of an existing order in localStorage.
 * Called from the tracking page when a poll returns a new status.
 */
export function updateActiveOrderStatus(tenantSlug: string, orderId: string, status: string): void {
  const orders = readOrders(tenantSlug)
  const order = orders.find(o => o.orderId === orderId)
  if (!order) return
  if (order.status === status) return // no change
  order.status = status
  order.statusUpdatedAt = new Date().toISOString()
  writeOrders(tenantSlug, orders)
}

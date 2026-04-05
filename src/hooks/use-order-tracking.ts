'use client'

import { useState, useEffect, useCallback } from 'react'

export interface ActiveOrder {
  orderId: string
  trackingToken: string
  createdAt: string
}

const STORAGE_PREFIX = 'active_orders_'
const MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

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
    const now = Date.now()
    const fresh = orders.filter(o => now - new Date(o.createdAt).getTime() < MAX_AGE_MS)

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
  orders.push({ orderId, trackingToken, createdAt: new Date().toISOString() })
  writeOrders(tenantSlug, orders)
}

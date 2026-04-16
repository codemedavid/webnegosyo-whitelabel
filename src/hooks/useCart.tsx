'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react'
import type { CartItem, MenuItem, Variation, Addon, Cart, VariationOption, CartBundleItem } from '@/types/database'
import {
  calculateCartItemSubtotal,
  calculateFullCartTotal,
  getFullCartItemCount,
  generateCartItemId,
} from '@/lib/cart-utils'
import { calculateSlotBundleSubtotal } from '@/lib/bundle-pricing'
import { fetchFreshCartItemData } from '@/lib/cart-refresh'

interface CartContextType extends Cart {
  orderType: string | null
  setOrderType: (orderType: string | null) => void
  messengerPsid: string | null
  setMessengerPsid: (psid: string | null) => void
  tenantId: string | null
  tenantSlug: string | null
  setTenantContext: (tenantId: string, tenantSlug: string) => void
  addItem: (
    menuItem: MenuItem,
    variationOrVariations: Variation | { [typeId: string]: VariationOption } | undefined,
    addons: Addon[],
    quantity: number,
    specialInstructions?: string,
    upsellSource?: CartItem['upsellSource'],
    upsellSourceItemId?: string
  ) => void
  removeItem: (cartItemId: string) => void
  updateQuantity: (cartItemId: string, quantity: number) => void
  clearCart: () => void
  getItem: (cartItemId: string) => CartItem | undefined
  bundleItems: CartBundleItem[]
  addBundleToCart: (bundleItem: Omit<CartBundleItem, 'id' | 'subtotal'>) => void
  removeBundleFromCart: (bundleCartId: string) => void
  updateBundleQuantity: (bundleCartId: string, quantity: number) => void
}

const CartContext = createContext<CartContextType | undefined>(undefined)

const CART_STORAGE_KEY_PREFIX = 'restaurant_cart_'
const ORDER_TYPE_STORAGE_KEY = 'restaurant_order_type'
const MESSENGER_PSID_KEY = 'messenger_psid'
const TENANT_CONTEXT_KEY = 'tenant_context'
const LEGACY_CART_STORAGE_KEY = 'restaurant_cart'

/** Get tenant-scoped cart storage key. Falls back to legacy key if no slug. */
function getCartStorageKey(tenantSlug?: string | null): string {
  return tenantSlug ? `${CART_STORAGE_KEY_PREFIX}${tenantSlug}` : LEGACY_CART_STORAGE_KEY
}
const CART_SYNC_DEBOUNCE_MS = 5000 // 5 seconds debounce for Messenger sync after last change
const MAX_QUANTITY = 99

// Helper functions for localStorage
/**
 * Validate that a value parsed from localStorage is a valid CartItem array.
 * Guards against corrupted or maliciously crafted localStorage data that could
 * cause runtime errors in price calculations or expose unexpected behavior.
 */
function isValidCartItems(items: unknown): items is CartItem[] {
  if (!Array.isArray(items)) return false
  return items.every((item) => {
    if (!item || typeof item !== 'object') return false
    const i = item as Record<string, unknown>
    return (
      typeof i.id === 'string' &&
      typeof i.quantity === 'number' &&
      i.quantity > 0 &&
      i.quantity <= 999 &&
      typeof i.subtotal === 'number' &&
      i.subtotal >= 0 &&
      i.menu_item !== null &&
      typeof i.menu_item === 'object' &&
      typeof (i.menu_item as Record<string, unknown>).id === 'string' &&
      typeof (i.menu_item as Record<string, unknown>).price === 'number' &&
      Array.isArray(i.selected_addons)
    )
  })
}

function loadCartFromStorage(tenantSlug?: string | null): CartItem[] {
  if (typeof window === 'undefined') return []

  try {
    const key = getCartStorageKey(tenantSlug)
    let stored = localStorage.getItem(key)

    // Migration: if using tenant-scoped key but nothing found, check legacy key
    if (!stored && tenantSlug) {
      const legacyStored = localStorage.getItem(LEGACY_CART_STORAGE_KEY)
      if (legacyStored) {
        stored = legacyStored
        // Migrate to tenant-scoped key and remove legacy
        localStorage.setItem(key, legacyStored)
        localStorage.removeItem(LEGACY_CART_STORAGE_KEY)
      }
    }

    if (stored) {
      const parsed: unknown = JSON.parse(stored)
      if (isValidCartItems(parsed)) {
        return parsed
      }
      console.warn('[useCart] Cart data in localStorage failed validation, resetting cart')
      localStorage.removeItem(key)
    }
  } catch (error) {
    console.error('Failed to load cart from storage:', error)
  }
  return []
}

function loadOrderTypeFromStorage(): string | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = localStorage.getItem(ORDER_TYPE_STORAGE_KEY)
    return stored || null
  } catch (error) {
    console.error('Failed to load order type from storage:', error)
  }
  return null
}

function saveCartToStorage(items: CartItem[], tenantSlug?: string | null) {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(getCartStorageKey(tenantSlug), JSON.stringify(items))
  } catch (error) {
    console.error('Failed to save cart to storage:', error)
  }
}

function saveOrderTypeToStorage(orderType: string | null) {
  if (typeof window === 'undefined') return

  try {
    if (orderType) {
      localStorage.setItem(ORDER_TYPE_STORAGE_KEY, orderType)
    } else {
      localStorage.removeItem(ORDER_TYPE_STORAGE_KEY)
    }
  } catch (error) {
    console.error('Failed to save order type to storage:', error)
  }
}

function loadMessengerPsidFromStorage(): string | null {
  if (typeof window === 'undefined') return null

  try {
    return localStorage.getItem(MESSENGER_PSID_KEY)
  } catch (error) {
    console.error('Failed to load messenger PSID from storage:', error)
  }
  return null
}

function saveMessengerPsidToStorage(psid: string | null) {
  if (typeof window === 'undefined') return

  try {
    if (psid) {
      localStorage.setItem(MESSENGER_PSID_KEY, psid)
    } else {
      localStorage.removeItem(MESSENGER_PSID_KEY)
    }
  } catch (error) {
    console.error('Failed to save messenger PSID to storage:', error)
  }
}

const BUNDLE_STORAGE_KEY_PREFIX = 'restaurant_cart_bundles_'
const LEGACY_BUNDLE_STORAGE_KEY = 'restaurant_cart_bundles'

function getBundleStorageKey(tenantSlug?: string | null): string {
  return tenantSlug ? `${BUNDLE_STORAGE_KEY_PREFIX}${tenantSlug}` : LEGACY_BUNDLE_STORAGE_KEY
}

function isValidBundleItems(items: unknown): items is CartBundleItem[] {
  if (!Array.isArray(items)) return false
  return items.every((item) => {
    if (!item || typeof item !== 'object') return false
    const i = item as Record<string, unknown>
    return (
      typeof i.id === 'string' &&
      typeof i.bundleId === 'string' &&
      typeof i.bundleName === 'string' &&
      Array.isArray(i.slots) &&
      typeof i.quantity === 'number' &&
      i.quantity > 0 &&
      typeof i.subtotal === 'number'
    )
  })
}

function loadBundlesFromStorage(tenantSlug?: string | null): CartBundleItem[] {
  if (typeof window === 'undefined') return []
  try {
    const key = getBundleStorageKey(tenantSlug)
    let stored = localStorage.getItem(key)

    // Migration: check legacy key
    if (!stored && tenantSlug) {
      const legacyStored = localStorage.getItem(LEGACY_BUNDLE_STORAGE_KEY)
      if (legacyStored) {
        stored = legacyStored
        localStorage.setItem(key, legacyStored)
        localStorage.removeItem(LEGACY_BUNDLE_STORAGE_KEY)
      }
    }

    if (stored) {
      const parsed: unknown = JSON.parse(stored)
      if (isValidBundleItems(parsed)) return parsed
      console.warn('[useCart] Bundle data in localStorage failed validation, resetting')
      localStorage.removeItem(key)
    }
  } catch (error) {
    console.error('Failed to load bundles from storage:', error)
  }
  return []
}

function saveBundlesToStorage(bundleItems: CartBundleItem[], tenantSlug?: string | null) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(getBundleStorageKey(tenantSlug), JSON.stringify(bundleItems))
  } catch (error) {
    console.error('Failed to save bundles to storage:', error)
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [bundleItems, setBundleItems] = useState<CartBundleItem[]>([])
  const [orderType, setOrderTypeState] = useState<string | null>(null)
  const [messengerPsid, setMessengerPsidState] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [tenantSlug, setTenantSlug] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Ref for debounced sync timeout
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Track if we've already synced the current cart state
  const lastSyncedCart = useRef<string>('')
  // Keep a stable ref to items so getItem doesn't need to be recreated on every items change
  const itemsRef = useRef<CartItem[]>([])
  // Keep bundle items ref in sync for use in debounced Messenger sync callback
  const bundleItemsRef = useRef<CartBundleItem[]>([])

  // Load cart, order type, PSID, and tenant context from localStorage on mount
  useEffect(() => {
    // Load tenant context FIRST so we can scope cart storage by tenant
    let resolvedSlug: string | null = null
    if (typeof window !== 'undefined') {
      try {
        const storedContext = localStorage.getItem(TENANT_CONTEXT_KEY)
        if (storedContext) {
          const parsed = JSON.parse(storedContext)
          const tid = parsed?.tenantId
          const ts = parsed?.tenantSlug
          if (typeof tid === 'string' && tid.trim() !== '' &&
            typeof ts === 'string' && ts.trim() !== '') {
            setTenantId(tid)
            setTenantSlug(ts)
            resolvedSlug = ts
          } else {
            console.warn('[useCart] Invalid tenant context in localStorage, clearing:', { tenantId: tid, tenantSlug: ts })
            localStorage.removeItem(TENANT_CONTEXT_KEY)
          }
        }
      } catch (error) {
        console.error('Failed to load tenant context:', error)
        try {
          localStorage.removeItem(TENANT_CONTEXT_KEY)
        } catch {
          // Ignore removal errors
        }
      }
    }

    // Now load cart data scoped to tenant
    const storedItems = loadCartFromStorage(resolvedSlug)
    const storedOrderType = loadOrderTypeFromStorage()
    const storedPsid = loadMessengerPsidFromStorage()
    setItems(storedItems)
    const storedBundles = loadBundlesFromStorage(resolvedSlug)
    setBundleItems(storedBundles)
    setOrderTypeState(storedOrderType)
    setMessengerPsidState(storedPsid)

    setIsInitialized(true)
  }, [])

  // Refs for tenant context to use in stable callbacks without dependency changes
  const tenantIdRef = useRef<string | null>(null)
  tenantIdRef.current = tenantId
  const tenantSlugRef = useRef<string | null>(null)
  tenantSlugRef.current = tenantSlug

  // Refresh cart items from Supabase to pick up admin edits (price, name, availability)
  const refreshCartItems = useCallback(async () => {
    const currentTenantId = tenantIdRef.current
    const currentItems = itemsRef.current
    if (!currentTenantId || currentItems.length === 0) return

    const itemIds = [...new Set(currentItems.map((item) => item.menu_item.id))]
    try {
      const freshData = await fetchFreshCartItemData(itemIds, currentTenantId)
      setItems((prevItems) => {
        let hasChanges = false
        const updatedItems = prevItems.reduce<CartItem[]>((acc, item) => {
          const fresh = freshData.get(item.menu_item.id)
          if (!fresh) return [...acc, item]

          if (!fresh.is_available) {
            console.warn(`[useCart] Item "${item.menu_item.name}" is no longer available, removing from cart`)
            hasChanges = true
            return acc
          }

          const updatedMenuItem = {
            ...item.menu_item,
            name: fresh.name,
            price: fresh.price,
            discounted_price: fresh.discounted_price,
            image_url: fresh.image_url,
          }

          const newSubtotal = calculateCartItemSubtotal(
            fresh.price,
            item.selected_variations || item.selected_variation,
            item.selected_addons,
            item.quantity
          )

          if (
            updatedMenuItem.name !== item.menu_item.name ||
            updatedMenuItem.price !== item.menu_item.price ||
            updatedMenuItem.discounted_price !== item.menu_item.discounted_price ||
            updatedMenuItem.image_url !== item.menu_item.image_url ||
            newSubtotal !== item.subtotal
          ) {
            hasChanges = true
            return [...acc, { ...item, menu_item: updatedMenuItem, subtotal: newSubtotal }]
          }

          return [...acc, item]
        }, [])

        return hasChanges ? updatedItems : prevItems
      })
    } catch {
      // Silent fail — cart refresh is non-critical
    }
  }, [])

  // Refresh cart items shortly after hydration and whenever the tab regains focus
  useEffect(() => {
    if (!isInitialized) return

    const timer = setTimeout(refreshCartItems, 1000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshCartItems()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isInitialized, refreshCartItems])

  // Keep refs in sync with state for stable callbacks and debounced Messenger sync
  itemsRef.current = items
  bundleItemsRef.current = bundleItems

  // Save cart to localStorage whenever it changes (scoped by tenant)
  useEffect(() => {
    if (isInitialized) {
      saveCartToStorage(items, tenantSlugRef.current)
    }
  }, [items, isInitialized])

  // Save bundle items to localStorage whenever they change (scoped by tenant)
  useEffect(() => {
    if (isInitialized) {
      saveBundlesToStorage(bundleItems, tenantSlugRef.current)
    }
  }, [bundleItems, isInitialized])

  // Save order type to localStorage whenever it changes
  useEffect(() => {
    if (isInitialized) {
      saveOrderTypeToStorage(orderType)
    }
  }, [orderType, isInitialized])

  // Save PSID to localStorage whenever it changes
  useEffect(() => {
    if (isInitialized) {
      saveMessengerPsidToStorage(messengerPsid)
    }
  }, [messengerPsid, isInitialized])

  const setOrderType = useCallback((newOrderType: string | null) => {
    setOrderTypeState(newOrderType)
  }, [])

  const setMessengerPsid = useCallback((psid: string | null) => {
    setMessengerPsidState(psid)
  }, [])

  const setTenantContext = useCallback((tid: string, ts: string) => {
    setTenantId(tid)
    setTenantSlug(ts)
    // Persist to localStorage (only in browser)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(TENANT_CONTEXT_KEY, JSON.stringify({ tenantId: tid, tenantSlug: ts }))
      } catch (error) {
        console.error('Failed to save tenant context:', error)
      }
    }
  }, [])

  // Debounced sync to Messenger when cart changes
  useEffect(() => {
    // Clear any pending timeout when prerequisites change
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current)
      syncTimeoutRef.current = null
    }

    if (!isInitialized || !messengerPsid || !tenantId || !tenantSlug) {
      return
    }

    // Create a hash of current cart state
    const cartHash = JSON.stringify([
      ...items.map(i => ({ id: i.id, qty: i.quantity })),
      ...bundleItems.map(bi => ({ id: bi.id, qty: bi.quantity })),
    ])

    // Don't sync if cart hasn't changed
    if (cartHash === lastSyncedCart.current) {
      return
    }

    // Capture current values for use in timeout callback
    const currentPsid = messengerPsid
    const currentTenantId = tenantId
    const currentTenantSlug = tenantSlug

    // Set new timeout for debounced sync
    syncTimeoutRef.current = setTimeout(() => {
      // Verify prerequisites are still valid before proceeding
      // This guards against race conditions where state changed during debounce
      if (!currentPsid || !currentTenantId || !currentTenantSlug) {
        return
      }

      // Read current state from refs to avoid stale closure values
      const latestItems = itemsRef.current
      const latestBundleItems = bundleItemsRef.current

      // Recompute cart hash from refs to ensure we sync the latest state
      const latestCartHash = JSON.stringify([
        ...latestItems.map(i => ({ id: i.id, qty: i.quantity })),
        ...latestBundleItems.map(bi => ({ id: bi.id, qty: bi.quantity })),
      ])

      // Don't sync if cart hasn't changed since last successful sync
      if (latestCartHash === lastSyncedCart.current) {
        return
      }

      // Format items for API
      const cartItems = latestItems.map(item => {
        let variation = ''
        if (item.selected_variation) {
          variation = item.selected_variation.name
        } else if (item.selected_variations) {
          variation = Object.values(item.selected_variations).map(v => v.name).join(', ')
        }
        return {
          name: item.menu_item.name,
          quantity: item.quantity,
          subtotal: item.subtotal,
          variation: variation || undefined,
        }
      })

      const bundleCartItems = latestBundleItems.map(bi => ({
        name: `Bundle: ${bi.bundleName}`,
        quantity: bi.quantity,
        subtotal: bi.subtotal,
        variation: bi.slots.map(s => `${s.slotName}: ${s.menuItemName}`).join(', '),
      }))
      const allCartItems = [...cartItems, ...bundleCartItems]

      // Send to Messenger (fire-and-forget)
      // Use relative URL to avoid CORS issues with www/non-www redirects and subdomain routing
      fetch('/api/messenger/send-cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: currentTenantId,
          tenantSlug: currentTenantSlug,
          psid: currentPsid,
          items: allCartItems,
        }),
      })
        .then(async response => {
          if (!response.ok) return

          const data = await response.json()
          if (data.success) {
            lastSyncedCart.current = latestCartHash
          } else if (data.message === 'No Facebook page connected') {
            // Prevent repeated failed attempts for config issues
            lastSyncedCart.current = latestCartHash
          }
        })
        .catch(() => {
          // Silent fail — messenger sync is non-critical
        })
    }, CART_SYNC_DEBOUNCE_MS)

    // Cleanup timeout on unmount or re-run
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
        syncTimeoutRef.current = null
      }
    }
  }, [items, bundleItems, isInitialized, messengerPsid, tenantId, tenantSlug])

  const addItem = useCallback(
    (
      menuItem: MenuItem,
      variationOrVariations: Variation | { [typeId: string]: VariationOption } | undefined,
      addons: Addon[],
      quantity: number,
      specialInstructions?: string,
      upsellSource?: CartItem['upsellSource'],
      upsellSourceItemId?: string
    ) => {
      // Cross-tenant contamination prevention: if the item belongs to a different
      // tenant than the current cart context, clear the cart before adding
      const currentTenantId = tenantIdRef.current
      if (currentTenantId && menuItem.tenant_id !== currentTenantId) {
        console.warn(
          `[useCart] Cross-tenant item detected (cart: ${currentTenantId}, item: ${menuItem.tenant_id}). Clearing cart.`
        )
        setItems([])
        setBundleItems([])
      }

      const subtotal = calculateCartItemSubtotal(
        menuItem.price,
        variationOrVariations,
        addons,
        quantity
      )

      // Determine if using new or legacy variation format
      const isNewFormat = variationOrVariations && typeof variationOrVariations === 'object' && !('price_modifier' in variationOrVariations)

      // Generate cart item ID based on format
      const cartItemId = isNewFormat
        ? generateCartItemId(menuItem.id, variationOrVariations as { [typeId: string]: VariationOption }, addons.map((a) => a.id))
        : generateCartItemId(menuItem.id, (variationOrVariations as Variation)?.id, addons.map((a) => a.id))

      setItems((prevItems) => {
        const existingItemIndex = prevItems.findIndex((item) => item.id === cartItemId)

        if (existingItemIndex > -1) {
          // Update existing item
          const updatedItems = [...prevItems]
          const existingItem = updatedItems[existingItemIndex]
          const newQuantity = Math.min(existingItem.quantity + quantity, MAX_QUANTITY)
          const newSubtotal = calculateCartItemSubtotal(
            menuItem.price,
            variationOrVariations,
            addons,
            newQuantity
          )

          updatedItems[existingItemIndex] = {
            ...existingItem,
            quantity: newQuantity,
            subtotal: newSubtotal,
            special_instructions: specialInstructions || existingItem.special_instructions,
          }

          return updatedItems
        }

        // Add new item with appropriate format
        const newItem: CartItem = {
          id: cartItemId,
          menu_item: menuItem,
          // Store variations in appropriate format
          ...(isNewFormat
            ? { selected_variations: variationOrVariations as { [typeId: string]: VariationOption } }
            : { selected_variation: variationOrVariations as Variation | undefined }
          ),
          selected_addons: addons,
          quantity,
          special_instructions: specialInstructions,
          subtotal,
          ...(upsellSource ? { upsellSource, upsellSourceItemId } : {}),
        }

        return [...prevItems, newItem]
      })
    },
    []
  )

  const removeItem = useCallback((cartItemId: string) => {
    setItems((prevItems) => prevItems.filter((item) => item.id !== cartItemId))
  }, [])

  const updateQuantity = useCallback((cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(cartItemId)
      return
    }

    // Enforce maximum quantity per item
    const clampedQuantity = Math.min(quantity, MAX_QUANTITY)

    setItems((prevItems) => {
      return prevItems.map((item) => {
        if (item.id === cartItemId) {
          // Use appropriate variation format for calculation
          const variations = item.selected_variations || item.selected_variation
          const newSubtotal = calculateCartItemSubtotal(
            item.menu_item.price,
            variations,
            item.selected_addons,
            clampedQuantity
          )
          return {
            ...item,
            quantity: clampedQuantity,
            subtotal: newSubtotal,
          }
        }
        return item
      })
    })
  }, [removeItem])

  const clearCart = useCallback(() => {
    setItems([])
    setBundleItems([])
    setOrderTypeState(null)
  }, [])

  const getItem = useCallback(
    (cartItemId: string) => {
      return itemsRef.current.find((item) => item.id === cartItemId)
    },
    [] // stable — reads from ref, not state
  )

  const addBundleToCart = useCallback(
    (bundleItem: Omit<CartBundleItem, 'id' | 'subtotal'>) => {
      const bundleCartId = `bundle_${bundleItem.bundleId}_${Date.now()}`
      const newBundleItem: CartBundleItem = {
        ...bundleItem,
        id: bundleCartId,
        subtotal: 0,
      }
      newBundleItem.subtotal = calculateSlotBundleSubtotal(newBundleItem)
      setBundleItems((prev) => [...prev, newBundleItem])
    },
    []
  )

  const removeBundleFromCart = useCallback((bundleCartId: string) => {
    setBundleItems((prev) => prev.filter((bi) => bi.id !== bundleCartId))
  }, [])

  const updateBundleQuantity = useCallback((bundleCartId: string, quantity: number) => {
    if (quantity <= 0) {
      setBundleItems((prev) => prev.filter((bi) => bi.id !== bundleCartId))
      return
    }
    const clampedQuantity = Math.min(quantity, MAX_QUANTITY)
    setBundleItems((prev) =>
      prev.map((bi) => {
        if (bi.id === bundleCartId) {
          const updated = { ...bi, quantity: clampedQuantity }
          updated.subtotal = calculateSlotBundleSubtotal(updated)
          return updated
        }
        return bi
      })
    )
  }, [])

  const total = useMemo(() => calculateFullCartTotal(items, bundleItems), [items, bundleItems])
  const item_count = useMemo(() => getFullCartItemCount(items, bundleItems), [items, bundleItems])

  // Memoize the context value to avoid triggering all consumers on every render.
  // Only changes when one of the actual values changes.
  const contextValue = useMemo<CartContextType>(() => ({
    items,
    total,
    item_count,
    orderType,
    setOrderType,
    messengerPsid,
    setMessengerPsid,
    tenantId,
    tenantSlug,
    setTenantContext,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    getItem,
    bundleItems,
    addBundleToCart,
    removeBundleFromCart,
    updateBundleQuantity,
  }), [
    items,
    total,
    item_count,
    orderType,
    setOrderType,
    messengerPsid,
    setMessengerPsid,
    tenantId,
    tenantSlug,
    setTenantContext,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    getItem,
    bundleItems,
    addBundleToCart,
    removeBundleFromCart,
    updateBundleQuantity,
  ])

  return (
    <CartContext.Provider
      value={contextValue}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}


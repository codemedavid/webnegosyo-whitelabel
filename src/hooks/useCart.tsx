'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { CartItem, MenuItem, Variation, Addon, Cart, VariationOption } from '@/types/database'
import {
  calculateCartItemSubtotal,
  calculateCartTotal,
  getCartItemCount,
  generateCartItemId,
} from '@/lib/cart-utils'

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
    specialInstructions?: string
  ) => void
  removeItem: (cartItemId: string) => void
  updateQuantity: (cartItemId: string, quantity: number) => void
  clearCart: () => void
  getItem: (cartItemId: string) => CartItem | undefined
}

const CartContext = createContext<CartContextType | undefined>(undefined)

const CART_STORAGE_KEY = 'restaurant_cart'
const ORDER_TYPE_STORAGE_KEY = 'restaurant_order_type'
const MESSENGER_PSID_KEY = 'messenger_psid'
const TENANT_CONTEXT_KEY = 'tenant_context'
const CART_SYNC_DEBOUNCE_MS = 5000 // 5 seconds debounce for Messenger sync after last change

// Helper functions for localStorage
function loadCartFromStorage(): CartItem[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = localStorage.getItem(CART_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
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

function saveCartToStorage(items: CartItem[]) {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
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

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [orderType, setOrderTypeState] = useState<string | null>(null)
  const [messengerPsid, setMessengerPsidState] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [tenantSlug, setTenantSlug] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Ref for debounced sync timeout
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Track if we've already synced the current cart state
  const lastSyncedCart = useRef<string>('')

  // Load cart, order type, PSID, and tenant context from localStorage on mount
  useEffect(() => {
    const storedItems = loadCartFromStorage()
    const storedOrderType = loadOrderTypeFromStorage()
    const storedPsid = loadMessengerPsidFromStorage()
    setItems(storedItems)
    setOrderTypeState(storedOrderType)
    setMessengerPsidState(storedPsid)

    // Load tenant context from localStorage
    if (typeof window !== 'undefined') {
      try {
        const storedContext = localStorage.getItem(TENANT_CONTEXT_KEY)
        if (storedContext) {
          const parsed = JSON.parse(storedContext)
          // Validate parsed values are non-empty strings before setting state
          const tid = parsed?.tenantId
          const ts = parsed?.tenantSlug
          if (typeof tid === 'string' && tid.trim() !== '' &&
            typeof ts === 'string' && ts.trim() !== '') {
            setTenantId(tid)
            setTenantSlug(ts)
          } else {
            // Invalid or corrupted data - clear the key and log warning
            console.warn('[useCart] Invalid tenant context in localStorage, clearing:', { tenantId: tid, tenantSlug: ts })
            localStorage.removeItem(TENANT_CONTEXT_KEY)
          }
        }
      } catch (error) {
        console.error('Failed to load tenant context:', error)
        // Clear potentially corrupted data
        try {
          localStorage.removeItem(TENANT_CONTEXT_KEY)
        } catch {
          // Ignore removal errors
        }
      }
    }

    setIsInitialized(true)
  }, [])

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (isInitialized) {
      saveCartToStorage(items)
    }
  }, [items, isInitialized])

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
    // Debug log to help diagnose sync issues
    if (process.env.NODE_ENV === 'development') {
      console.log('[Cart Sync] Checking conditions:', {
        isInitialized,
        hasPsid: !!messengerPsid,
        hasTenantId: !!tenantId,
        hasTenantSlug: !!tenantSlug,
        itemCount: items.length,
      })
    }

    // Clear any pending timeout when prerequisites change
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current)
      syncTimeoutRef.current = null
    }

    if (!isInitialized || !messengerPsid || !tenantId || !tenantSlug) {
      if (process.env.NODE_ENV === 'development' && items.length > 0) {
        console.log('[Cart Sync] ⏭️ Skipping - missing requirements:', {
          isInitialized,
          messengerPsid: messengerPsid ? '***' + messengerPsid.slice(-4) : null,
          tenantId: tenantId || null,
          tenantSlug: tenantSlug || null,
        })
      }
      return
    }

    // Create a hash of current cart state
    const cartHash = JSON.stringify(items.map(i => ({ id: i.id, qty: i.quantity })))

    // Don't sync if cart hasn't changed
    if (cartHash === lastSyncedCart.current) {
      return
    }

    // Log that we're scheduling a sync
    if (process.env.NODE_ENV === 'development') {
      console.log('[Cart Sync] 📤 Scheduling Messenger sync in', CART_SYNC_DEBOUNCE_MS, 'ms')
    }

    // Capture current values for use in timeout callback
    const currentPsid = messengerPsid
    const currentTenantId = tenantId
    const currentTenantSlug = tenantSlug
    const currentItems = items

    // Set new timeout for debounced sync
    syncTimeoutRef.current = setTimeout(() => {
      // Verify prerequisites are still valid before proceeding
      // This guards against race conditions where state changed during debounce
      if (!currentPsid || !currentTenantId || !currentTenantSlug) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[Cart Sync] ⏭️ Timeout fired but prerequisites no longer valid')
        }
        return
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log('[Cart Sync] 🚀 Sending cart to Messenger...')
      }
      // Format items for API
      const cartItems = currentItems.map(item => {
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

      // Send to Messenger (fire-and-forget)
      // Use relative URL to avoid CORS issues with www/non-www redirects and subdomain routing
      fetch('/api/messenger/send-cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: currentTenantId,
          tenantSlug: currentTenantSlug,
          psid: currentPsid,
          items: cartItems,
        }),
      })
        .then(async response => {
          if (!response.ok) {
            const errorText = await response.text()
            console.error('[Cart] ❌ Messenger sync failed with status:', response.status, errorText)
            return
          }

          const data = await response.json()
          if (data.success) {
            console.log('[Cart] ✅ Synced cart to Messenger')
            lastSyncedCart.current = cartHash
          } else {
            // API returned 200 but operation failed
            console.warn('[Cart] ⚠️ Messenger sync returned success=false:', data.message || data.error)
            // Still update lastSyncedCart to prevent repeated failed attempts
            // but only if it's a configuration issue, not a transient error
            if (data.message === 'No Facebook page connected') {
              lastSyncedCart.current = cartHash
            }
          }
        })
        .catch(error => {
          console.error('[Cart] ❌ Failed to sync cart to Messenger:', error)
        })
    }, CART_SYNC_DEBOUNCE_MS)

    // Cleanup timeout on unmount or re-run
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
        syncTimeoutRef.current = null
      }
    }
  }, [items, isInitialized, messengerPsid, tenantId, tenantSlug])

  const addItem = useCallback(
    (
      menuItem: MenuItem,
      variationOrVariations: Variation | { [typeId: string]: VariationOption } | undefined,
      addons: Addon[],
      quantity: number,
      specialInstructions?: string
    ) => {
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
          const newQuantity = existingItem.quantity + quantity
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

    setItems((prevItems) => {
      return prevItems.map((item) => {
        if (item.id === cartItemId) {
          // Use appropriate variation format for calculation
          const variations = item.selected_variations || item.selected_variation
          const newSubtotal = calculateCartItemSubtotal(
            item.menu_item.price,
            variations,
            item.selected_addons,
            quantity
          )
          return {
            ...item,
            quantity,
            subtotal: newSubtotal,
          }
        }
        return item
      })
    })
  }, [removeItem])

  const clearCart = useCallback(() => {
    setItems([])
    setOrderTypeState(null)
  }, [])

  const getItem = useCallback(
    (cartItemId: string) => {
      return items.find((item) => item.id === cartItemId)
    },
    [items]
  )

  const total = calculateCartTotal(items)
  const item_count = getCartItemCount(items)

  return (
    <CartContext.Provider
      value={{
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
      }}
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


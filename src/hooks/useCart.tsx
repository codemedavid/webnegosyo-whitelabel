'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
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

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [orderType, setOrderTypeState] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Load cart and order type from localStorage on mount
  useEffect(() => {
    const storedItems = loadCartFromStorage()
    const storedOrderType = loadOrderTypeFromStorage()
    setItems(storedItems)
    setOrderTypeState(storedOrderType)
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

  const setOrderType = useCallback((newOrderType: string | null) => {
    setOrderTypeState(newOrderType)
  }, [])

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


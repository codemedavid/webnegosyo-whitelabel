'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { CartItem, MenuItem, Variation, Addon, Cart } from '@/types/database'
import {
  calculateCartItemSubtotal,
  calculateCartTotal,
  getCartItemCount,
  generateCartItemId,
} from '@/lib/cart-utils'

interface CartContextType extends Cart {
  addItem: (
    menuItem: MenuItem,
    variation: Variation | undefined,
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

function saveCartToStorage(items: CartItem[]) {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
  } catch (error) {
    console.error('Failed to save cart to storage:', error)
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isInitialized, setIsInitialized] = useState(false)

  // Load cart from localStorage on mount
  useEffect(() => {
    const storedItems = loadCartFromStorage()
    setItems(storedItems)
    setIsInitialized(true)
  }, [])

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (isInitialized) {
      saveCartToStorage(items)
    }
  }, [items, isInitialized])

  const addItem = useCallback(
    (
      menuItem: MenuItem,
      variation: Variation | undefined,
      addons: Addon[],
      quantity: number,
      specialInstructions?: string
    ) => {
      const subtotal = calculateCartItemSubtotal(
        menuItem.price,
        variation,
        addons,
        quantity
      )

      const cartItemId = generateCartItemId(
        menuItem.id,
        variation?.id,
        addons.map((a) => a.id)
      )

      setItems((prevItems) => {
        const existingItemIndex = prevItems.findIndex((item) => item.id === cartItemId)

        if (existingItemIndex > -1) {
          // Update existing item
          const updatedItems = [...prevItems]
          const existingItem = updatedItems[existingItemIndex]
          const newQuantity = existingItem.quantity + quantity
          const newSubtotal = calculateCartItemSubtotal(
            menuItem.price,
            variation,
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

        // Add new item
        const newItem: CartItem = {
          id: cartItemId,
          menu_item: menuItem,
          selected_variation: variation,
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
          const newSubtotal = calculateCartItemSubtotal(
            item.menu_item.price,
            item.selected_variation,
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


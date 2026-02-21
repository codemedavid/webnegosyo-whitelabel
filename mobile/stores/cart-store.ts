import { useState, useEffect } from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { CartItem, MenuItem, Variation, VariationOption, Addon } from '@/types/database'
import {
  calculateCartItemSubtotal,
  calculateCartTotal,
  getCartItemCount,
  generateCartItemId,
} from '@/lib/cart-utils'

interface CartState {
  items: CartItem[]
  orderType: string | null
  tenantId: string | null
  tenantSlug: string | null

  // Computed
  total: number
  itemCount: number

  // Actions
  addItem: (
    menuItem: MenuItem,
    variationOrVariations: Variation | { [typeId: string]: VariationOption } | undefined,
    addons: Addon[],
    quantity: number,
    specialInstructions?: string
  ) => void
  removeItem: (cartItemId: string) => void
  updateQuantity: (cartItemId: string, quantity: number) => void
  clearCart: (options?: { resetOrderType?: boolean }) => void
  setOrderType: (orderType: string | null) => void
  setTenantContext: (tenantId: string, tenantSlug: string) => void
  getItem: (cartItemId: string) => CartItem | undefined
}

// Hydration helper — lets consumers wait for AsyncStorage rehydration
export const useCartHydrated = () => {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    const unsub = useCartStore.persist.onFinishHydration(() => setHydrated(true))
    // If already hydrated (e.g. synchronous or fast)
    if (useCartStore.persist.hasHydrated()) setHydrated(true)
    return unsub
  }, [])
  return hydrated
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      orderType: null,
      tenantId: null,
      tenantSlug: null,
      total: 0,
      itemCount: 0,

      addItem: (menuItem, variationOrVariations, addons, quantity, specialInstructions) => {
        const isNewFormat = variationOrVariations &&
          typeof variationOrVariations === 'object' &&
          !('price_modifier' in variationOrVariations)

        const cartItemId = generateCartItemId(
          menuItem.id,
          isNewFormat
            ? variationOrVariations as { [typeId: string]: VariationOption }
            : (variationOrVariations as Variation | undefined)?.id,
          addons.map(a => a.id)
        )

        const effectivePrice = menuItem.discounted_price ?? menuItem.price
        const subtotal = calculateCartItemSubtotal(effectivePrice, variationOrVariations, addons, quantity)

        const newItem: CartItem = {
          id: cartItemId,
          menu_item: menuItem,
          selected_variations: isNewFormat
            ? variationOrVariations as { [typeId: string]: VariationOption }
            : undefined,
          selected_variation: !isNewFormat
            ? variationOrVariations as Variation | undefined
            : undefined,
          selected_addons: addons,
          quantity,
          special_instructions: specialInstructions,
          subtotal,
        }

        set(state => {
          const existingIndex = state.items.findIndex(i => i.id === cartItemId)
          let newItems: CartItem[]

          if (existingIndex >= 0) {
            newItems = [...state.items]
            const existing = newItems[existingIndex]
            const newQuantity = existing.quantity + quantity
            newItems[existingIndex] = {
              ...existing,
              quantity: newQuantity,
              subtotal: calculateCartItemSubtotal(
                effectivePrice,
                variationOrVariations,
                addons,
                newQuantity
              ),
            }
          } else {
            newItems = [...state.items, newItem]
          }

          return {
            items: newItems,
            total: calculateCartTotal(newItems),
            itemCount: getCartItemCount(newItems),
          }
        })
      },

      removeItem: (cartItemId) => {
        set(state => {
          const newItems = state.items.filter(i => i.id !== cartItemId)
          return {
            items: newItems,
            total: calculateCartTotal(newItems),
            itemCount: getCartItemCount(newItems),
          }
        })
      },

      updateQuantity: (cartItemId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(cartItemId)
          return
        }

        set(state => {
          const newItems = state.items.map(item => {
            if (item.id !== cartItemId) return item
            const effectivePrice = item.menu_item.discounted_price ?? item.menu_item.price
            const variationOrVariations = item.selected_variations ?? item.selected_variation
            return {
              ...item,
              quantity,
              subtotal: calculateCartItemSubtotal(
                effectivePrice,
                variationOrVariations,
                item.selected_addons,
                quantity
              ),
            }
          })
          return {
            items: newItems,
            total: calculateCartTotal(newItems),
            itemCount: getCartItemCount(newItems),
          }
        })
      },

      clearCart: (options) => {
        const resetOrderType = options?.resetOrderType ?? true
        set({
          items: [],
          total: 0,
          itemCount: 0,
          ...(resetOrderType ? { orderType: null } : {}),
        })
      },

      setOrderType: (orderType) => {
        set({ orderType })
      },

      setTenantContext: (tenantId, tenantSlug) => {
        set({ tenantId, tenantSlug })
      },

      getItem: (cartItemId) => {
        return get().items.find(i => i.id === cartItemId)
      },
    }),
    {
      name: 'cart-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        items: state.items,
        orderType: state.orderType,
        tenantId: state.tenantId,
        tenantSlug: state.tenantSlug,
        total: state.total,
        itemCount: state.itemCount,
      }),
    }
  )
)

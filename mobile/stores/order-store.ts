import { create } from 'zustand'
import type { OrderSaveStatus } from '@/lib/checkout-outcome'
import type { CartItem } from '@/types/database'

export interface CompletedOrderData {
  dailyNumber?: number | null
  items: CartItem[]
  total: number
  customerData: Record<string, string>
  formFields: { field_name: string; field_label: string }[]
  isCustomerHistoryTracked: boolean
  previousOrderCount: number
  totalOrderCount: number
  orderTypeName: string | null
  paymentMethodName: string | null
  paymentMethodDetails: string | null
  messengerMessage: string
  messengerUrl: string
  orderId: string | null
  /**
   * What actually happened to the order. Required, because the confirmation
   * screen used to infer success from `orderId` — which cannot tell a saved
   * order from a refused one from a Messenger-only tenant that stores none.
   */
  saveStatus: OrderSaveStatus
  /** The one customer-facing sentence about a refusal or failure; null when there is nothing to add. */
  saveMessage: string | null
  /** Human label for an advance/scheduled order, e.g. "Tue, Jun 18 · 5:00 PM"; null = ASAP. */
  scheduledForLabel?: string | null
}

interface OrderStore {
  completedOrder: CompletedOrderData | null
  setCompletedOrder: (data: CompletedOrderData) => void
  clearCompletedOrder: () => void
}

export const useOrderStore = create<OrderStore>((set) => ({
  completedOrder: null,
  setCompletedOrder: (data) => set({ completedOrder: data }),
  clearCompletedOrder: () => set({ completedOrder: null }),
}))
